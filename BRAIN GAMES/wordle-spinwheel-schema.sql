-- ============================================================================
-- WORDLE GAME DATABASE SCHEMA
-- ============================================================================

-- Table: wordle_daily_words
-- Stores the daily word challenges
CREATE TABLE wordle_daily_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(5) NOT NULL,
    date DATE NOT NULL UNIQUE,
    difficulty INTEGER DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
    times_played INTEGER DEFAULT 0,
    times_won INTEGER DEFAULT 0,
    average_guesses DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: wordle_game_sessions
CREATE TABLE wordle_game_sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(255) UNIQUE,
    word_id INTEGER REFERENCES wordle_daily_words(id),
    venue_id INTEGER, -- Link to your venue system
    user_identifier VARCHAR(255),
    ip_address INET,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    won BOOLEAN,
    guesses_count INTEGER,
    guesses JSONB, -- Array of guess words and evaluations
    share_count INTEGER DEFAULT 0
);

-- Table: wordle_player_stats
CREATE TABLE wordle_player_stats (
    id SERIAL PRIMARY KEY,
    user_identifier VARCHAR(255) UNIQUE NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    guess_distribution JSONB DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0}',
    last_played DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Wordle
CREATE INDEX idx_wordle_sessions_user ON wordle_game_sessions(user_identifier);
CREATE INDEX idx_wordle_sessions_date ON wordle_game_sessions(started_at);
CREATE INDEX idx_wordle_sessions_word ON wordle_game_sessions(word_id);
CREATE INDEX idx_wordle_daily_date ON wordle_daily_words(date);
CREATE INDEX idx_wordle_stats_user ON wordle_player_stats(user_identifier);

-- ============================================================================
-- SPIN THE WHEEL DATABASE SCHEMA
-- ============================================================================

-- Table: wheel_prizes
-- Configure available prizes for the wheel
CREATE TABLE wheel_prizes (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER, -- Customize prizes per venue
    label VARCHAR(100) NOT NULL,
    prize_value VARCHAR(50), -- e.g., "10", "20", "drink", "dessert"
    emoji VARCHAR(10),
    description TEXT,
    color VARCHAR(7), -- Hex color code
    probability INTEGER DEFAULT 10 CHECK (probability > 0),
    terms_conditions TEXT,
    expiry_days INTEGER DEFAULT 7,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: wheel_spins
-- Track each spin
CREATE TABLE wheel_spins (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(255),
    venue_id INTEGER,
    user_identifier VARCHAR(255),
    ip_address INET,
    prize_id INTEGER REFERENCES wheel_prizes(id),
    prize_code VARCHAR(100) UNIQUE NOT NULL,
    spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    claimed_at TIMESTAMP,
    claimed_by VARCHAR(255), -- Staff member who validated the prize
    redeemed BOOLEAN DEFAULT false
);

-- Table: wheel_daily_limits
-- Track spins per user per day
CREATE TABLE wheel_daily_limits (
    id SERIAL PRIMARY KEY,
    user_identifier VARCHAR(255),
    spin_date DATE DEFAULT CURRENT_DATE,
    spins_used INTEGER DEFAULT 0,
    max_spins INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_identifier, spin_date)
);

-- Table: wheel_analytics
-- Aggregate statistics for venues
CREATE TABLE wheel_analytics (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER,
    date DATE DEFAULT CURRENT_DATE,
    total_spins INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    prizes_won JSONB, -- Count by prize type
    prizes_redeemed INTEGER DEFAULT 0,
    redemption_rate DECIMAL(5,2),
    UNIQUE(venue_id, date)
);

-- Indexes for Spin the Wheel
CREATE INDEX idx_wheel_spins_user ON wheel_spins(user_identifier);
CREATE INDEX idx_wheel_spins_date ON wheel_spins(spun_at);
CREATE INDEX idx_wheel_spins_venue ON wheel_spins(venue_id);
CREATE INDEX idx_wheel_spins_code ON wheel_spins(prize_code);
CREATE INDEX idx_wheel_limits_user_date ON wheel_daily_limits(user_identifier, spin_date);
CREATE INDEX idx_wheel_prizes_venue ON wheel_prizes(venue_id);

-- ============================================================================
-- WORDLE FUNCTIONS
-- ============================================================================

-- Function to update player stats after a game
CREATE OR REPLACE FUNCTION update_wordle_stats(
    p_user_identifier VARCHAR(255),
    p_won BOOLEAN,
    p_guesses INTEGER
) RETURNS VOID AS $$
BEGIN
    INSERT INTO wordle_player_stats (user_identifier, games_played, games_won, current_streak, max_streak, guess_distribution)
    VALUES (
        p_user_identifier,
        1,
        CASE WHEN p_won THEN 1 ELSE 0 END,
        CASE WHEN p_won THEN 1 ELSE 0 END,
        CASE WHEN p_won THEN 1 ELSE 0 END,
        jsonb_build_object(p_guesses::text, 1)
    )
    ON CONFLICT (user_identifier) 
    DO UPDATE SET
        games_played = wordle_player_stats.games_played + 1,
        games_won = wordle_player_stats.games_won + CASE WHEN p_won THEN 1 ELSE 0 END,
        current_streak = CASE 
            WHEN p_won THEN wordle_player_stats.current_streak + 1 
            ELSE 0 
        END,
        max_streak = CASE
            WHEN p_won AND (wordle_player_stats.current_streak + 1) > wordle_player_stats.max_streak
            THEN wordle_player_stats.current_streak + 1
            ELSE wordle_player_stats.max_streak
        END,
        guess_distribution = CASE
            WHEN p_won THEN jsonb_set(
                wordle_player_stats.guess_distribution,
                ARRAY[p_guesses::text],
                ((wordle_player_stats.guess_distribution->>p_guesses::text)::int + 1)::text::jsonb
            )
            ELSE wordle_player_stats.guess_distribution
        END,
        last_played = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create daily word
CREATE OR REPLACE FUNCTION get_daily_wordle_word(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(word VARCHAR(5), word_id INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT w.word, w.id
    FROM wordle_daily_words w
    WHERE w.date = p_date;
    
    -- If no word exists for today, this would be handled by your backend
    -- which would insert a new word from your word list
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SPIN THE WHEEL FUNCTIONS
-- ============================================================================

-- Function to check and update daily spin limit
CREATE OR REPLACE FUNCTION check_spin_limit(
    p_user_identifier VARCHAR(255),
    p_max_spins INTEGER DEFAULT 3
) RETURNS INTEGER AS $$
DECLARE
    v_spins_used INTEGER;
BEGIN
    INSERT INTO wheel_daily_limits (user_identifier, spins_used, max_spins)
    VALUES (p_user_identifier, 0, p_max_spins)
    ON CONFLICT (user_identifier, spin_date) DO NOTHING;
    
    SELECT spins_used INTO v_spins_used
    FROM wheel_daily_limits
    WHERE user_identifier = p_user_identifier
    AND spin_date = CURRENT_DATE;
    
    RETURN COALESCE(p_max_spins - v_spins_used, p_max_spins);
END;
$$ LANGUAGE plpgsql;

-- Function to record a spin
CREATE OR REPLACE FUNCTION record_wheel_spin(
    p_user_identifier VARCHAR(255),
    p_prize_id INTEGER,
    p_prize_code VARCHAR(100),
    p_venue_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_spins_left INTEGER;
BEGIN
    -- Check if user has spins left
    v_spins_left := check_spin_limit(p_user_identifier);
    
    IF v_spins_left <= 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Record the spin
    INSERT INTO wheel_spins (user_identifier, prize_id, prize_code, venue_id)
    VALUES (p_user_identifier, p_prize_id, p_prize_code, p_venue_id);
    
    -- Update daily limit
    UPDATE wheel_daily_limits
    SET spins_used = spins_used + 1
    WHERE user_identifier = p_user_identifier
    AND spin_date = CURRENT_DATE;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to redeem a prize
CREATE OR REPLACE FUNCTION redeem_wheel_prize(
    p_prize_code VARCHAR(100),
    p_claimed_by VARCHAR(255)
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE wheel_spins
    SET 
        redeemed = TRUE,
        claimed_at = CURRENT_TIMESTAMP,
        claimed_by = p_claimed_by
    WHERE prize_code = p_prize_code
    AND redeemed = FALSE
    AND spun_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'; -- Expiry check
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to update wheel analytics
CREATE OR REPLACE FUNCTION update_wheel_analytics(p_venue_id INTEGER DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    INSERT INTO wheel_analytics (venue_id, date, total_spins, unique_users, prizes_won, prizes_redeemed)
    SELECT
        COALESCE(p_venue_id, 0),
        CURRENT_DATE,
        COUNT(*),
        COUNT(DISTINCT user_identifier),
        jsonb_object_agg(p.label, COUNT(s.id)),
        COUNT(*) FILTER (WHERE s.redeemed = TRUE)
    FROM wheel_spins s
    JOIN wheel_prizes p ON s.prize_id = p.id
    WHERE DATE(s.spun_at) = CURRENT_DATE
    AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
    GROUP BY CURRENT_DATE
    ON CONFLICT (venue_id, date)
    DO UPDATE SET
        total_spins = EXCLUDED.total_spins,
        unique_users = EXCLUDED.unique_users,
        prizes_won = EXCLUDED.prizes_won,
        prizes_redeemed = EXCLUDED.prizes_redeemed,
        redemption_rate = (EXCLUDED.prizes_redeemed::DECIMAL / EXCLUDED.total_spins * 100);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- View: Wordle Daily Statistics
CREATE VIEW wordle_daily_stats AS
SELECT 
    w.date,
    w.word,
    w.times_played,
    w.times_won,
    ROUND((w.times_won::DECIMAL / NULLIF(w.times_played, 0) * 100), 2) as win_rate,
    w.average_guesses,
    COUNT(DISTINCT s.user_identifier) as unique_players
FROM wordle_daily_words w
LEFT JOIN wordle_game_sessions s ON w.id = s.word_id
GROUP BY w.id, w.date, w.word, w.times_played, w.times_won, w.average_guesses
ORDER BY w.date DESC;

-- View: Wheel Prize Redemption Stats
CREATE VIEW wheel_prize_stats AS
SELECT 
    p.label,
    p.description,
    COUNT(s.id) as times_won,
    COUNT(s.id) FILTER (WHERE s.redeemed = TRUE) as times_redeemed,
    ROUND((COUNT(s.id) FILTER (WHERE s.redeemed = TRUE)::DECIMAL / NULLIF(COUNT(s.id), 0) * 100), 2) as redemption_rate,
    p.probability
FROM wheel_prizes p
LEFT JOIN wheel_spins s ON p.id = s.prize_id
WHERE p.active = TRUE
GROUP BY p.id, p.label, p.description, p.probability
ORDER BY times_won DESC;

-- View: User Engagement Overview
CREATE VIEW user_engagement_overview AS
SELECT 
    COALESCE(w.user_identifier, ws.user_identifier) as user_id,
    COALESCE(w.games_played, 0) as wordle_games,
    COALESCE(w.games_won, 0) as wordle_wins,
    COUNT(DISTINCT ws.id) as wheel_spins,
    COUNT(DISTINCT ws.id) FILTER (WHERE ws.redeemed = TRUE) as prizes_redeemed,
    MAX(GREATEST(w.last_played, DATE(ws.spun_at))) as last_activity
FROM wordle_player_stats w
FULL OUTER JOIN wheel_spins ws ON w.user_identifier = ws.user_identifier
GROUP BY COALESCE(w.user_identifier, ws.user_identifier);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default wheel prizes (customize for each venue)
INSERT INTO wheel_prizes (label, prize_value, emoji, description, color, probability) VALUES
('10% OFF', '10', '💰', '10% discount on your entire bill', '#ef4444', 25),
('FREE DRINK', 'drink', '🍹', 'Complimentary beverage of your choice', '#f59e0b', 20),
('15% OFF', '15', '🎁', '15% discount on your entire bill', '#10b981', 15),
('TRY AGAIN', '0', '🔄', 'Better luck next spin!', '#6b7280', 15),
('FREE DESSERT', 'dessert', '🍰', 'Complimentary dessert from our menu', '#ec4899', 15),
('20% OFF', '20', '🌟', '20% discount on your entire bill', '#8b5cf6', 5),
('5% OFF', '5', '🎯', '5% discount on your entire bill', '#3b82f6', 25),
('FREE STARTER', 'starter', '🥗', 'Complimentary starter of your choice', '#14b8a6', 10);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update daily word stats when a game completes
CREATE OR REPLACE FUNCTION update_daily_word_stats() RETURNS TRIGGER AS $$
BEGIN
    UPDATE wordle_daily_words
    SET 
        times_played = times_played + 1,
        times_won = times_won + CASE WHEN NEW.won THEN 1 ELSE 0 END,
        average_guesses = (
            SELECT AVG(guesses_count)
            FROM wordle_game_sessions
            WHERE word_id = NEW.word_id AND won = TRUE
        )
    WHERE id = NEW.word_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_word_stats
AFTER INSERT ON wordle_game_sessions
FOR EACH ROW
WHEN (NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION update_daily_word_stats();

-- ============================================================================
-- UTILITY QUERIES
-- ============================================================================

-- Check available spins for a user
-- SELECT check_spin_limit('user123');

-- Get today's Wordle stats
-- SELECT * FROM wordle_daily_stats WHERE date = CURRENT_DATE;

-- Get wheel prize redemption rates
-- SELECT * FROM wheel_prize_stats;

-- View user engagement
-- SELECT * FROM user_engagement_overview ORDER BY last_activity DESC LIMIT 100;

-- Get unredeemed prizes
-- SELECT * FROM wheel_spins WHERE redeemed = FALSE AND spun_at >= CURRENT_DATE - INTERVAL '7 days';

-- ============================================================================
-- ADMIN QUERIES
-- ============================================================================

-- Top Wordle players by win streak
-- SELECT user_identifier, games_played, games_won, current_streak, max_streak
-- FROM wordle_player_stats
-- ORDER BY max_streak DESC, games_won DESC
-- LIMIT 50;

-- Daily wheel performance
-- SELECT date, total_spins, unique_users, prizes_redeemed, redemption_rate
-- FROM wheel_analytics
-- ORDER BY date DESC
-- LIMIT 30;

-- Most popular prizes
-- SELECT p.label, COUNT(*) as times_won
-- FROM wheel_spins s
-- JOIN wheel_prizes p ON s.prize_id = p.id
-- GROUP BY p.label
-- ORDER BY times_won DESC;

-- Grant permissions (adjust based on your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_api_user;

-- Comments for documentation
COMMENT ON TABLE wordle_daily_words IS 'Stores daily Wordle challenge words and statistics';
COMMENT ON TABLE wordle_game_sessions IS 'Tracks individual Wordle game sessions';
COMMENT ON TABLE wordle_player_stats IS 'Aggregated player statistics for Wordle';
COMMENT ON TABLE wheel_prizes IS 'Configuration of available prizes for the spin wheel';
COMMENT ON TABLE wheel_spins IS 'Records of every spin and prize won';
COMMENT ON TABLE wheel_daily_limits IS 'Tracks daily spin limits per user';
COMMENT ON TABLE wheel_analytics IS 'Aggregated analytics for wheel performance';