-- ============================================================================
-- REAL-TIME TRIVIA GAME DATABASE SCHEMA
-- PostgreSQL Schema for multiplayer trivia with WebSocket support
-- ============================================================================

-- Table: trivia_rooms
-- Stores information about created game rooms
CREATE TABLE trivia_rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(4) UNIQUE NOT NULL,
    host_id VARCHAR(255) NOT NULL,
    host_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    venue_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Table: trivia_players  
-- Tracks players who have joined rooms
CREATE TABLE trivia_players (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(4) REFERENCES trivia_rooms(room_code) ON DELETE CASCADE,
    player_id VARCHAR(255) NOT NULL,
    player_name VARCHAR(100) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_code, player_id)
);

-- Table: trivia_games
-- Records of completed games
CREATE TABLE trivia_games (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(4) REFERENCES trivia_rooms(room_code),
    category VARCHAR(50) NOT NULL,
    total_questions INTEGER NOT NULL,
    total_players INTEGER,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Table: trivia_scores
-- Individual player scores for each game
CREATE TABLE trivia_scores (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES trivia_games(id) ON DELETE CASCADE,
    player_id VARCHAR(255) NOT NULL,
    player_name VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    rank INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: trivia_questions
-- Optional: Custom questions per venue
CREATE TABLE trivia_questions (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER,
    category VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    answers JSONB NOT NULL, -- Array of 4 answer options
    correct_answer INTEGER NOT NULL CHECK (correct_answer BETWEEN 0 AND 3),
    difficulty INTEGER DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
    times_used INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: trivia_player_stats
-- Aggregate statistics per player
CREATE TABLE trivia_player_stats (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(100) UNIQUE NOT NULL,
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    avg_score DECIMAL(10,2) DEFAULT 0,
    favorite_category VARCHAR(50),
    last_played TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: trivia_venue_analytics
-- Daily analytics per venue
CREATE TABLE trivia_venue_analytics (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    total_rooms INTEGER DEFAULT 0,
    total_games INTEGER DEFAULT 0,
    total_players INTEGER DEFAULT 0,
    unique_players INTEGER DEFAULT 0,
    avg_players_per_game DECIMAL(5,2),
    most_popular_category VARCHAR(50),
    UNIQUE(venue_id, date)
);

-- Indexes
CREATE INDEX idx_trivia_rooms_code ON trivia_rooms(room_code);
CREATE INDEX idx_trivia_rooms_active ON trivia_rooms(active);
CREATE INDEX idx_trivia_rooms_venue ON trivia_rooms(venue_id);
CREATE INDEX idx_trivia_players_room ON trivia_players(room_code);
CREATE INDEX idx_trivia_games_room ON trivia_games(room_code);
CREATE INDEX idx_trivia_games_completed ON trivia_games(completed_at);
CREATE INDEX idx_trivia_scores_game ON trivia_scores(game_id);
CREATE INDEX idx_trivia_scores_player ON trivia_scores(player_name);
CREATE INDEX idx_trivia_questions_category ON trivia_questions(category);
CREATE INDEX idx_trivia_questions_venue ON trivia_questions(venue_id);
CREATE INDEX idx_trivia_stats_player ON trivia_player_stats(player_name);
CREATE INDEX idx_trivia_venue_analytics_venue_date ON trivia_venue_analytics(venue_id, date);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update player statistics
CREATE OR REPLACE FUNCTION update_trivia_player_stats(
    p_player_name VARCHAR(100),
    p_score INTEGER,
    p_rank INTEGER,
    p_category VARCHAR(50)
) RETURNS VOID AS $$
BEGIN
    INSERT INTO trivia_player_stats (
        player_name, 
        total_games, 
        total_wins, 
        best_score, 
        total_score, 
        avg_score,
        favorite_category,
        last_played
    )
    VALUES (
        p_player_name,
        1,
        CASE WHEN p_rank = 1 THEN 1 ELSE 0 END,
        p_score,
        p_score,
        p_score,
        p_category,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (player_name) 
    DO UPDATE SET
        total_games = trivia_player_stats.total_games + 1,
        total_wins = trivia_player_stats.total_wins + CASE WHEN p_rank = 1 THEN 1 ELSE 0 END,
        best_score = GREATEST(trivia_player_stats.best_score, p_score),
        total_score = trivia_player_stats.total_score + p_score,
        avg_score = (trivia_player_stats.total_score + p_score)::DECIMAL / (trivia_player_stats.total_games + 1),
        last_played = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to update venue analytics
CREATE OR REPLACE FUNCTION update_trivia_venue_analytics(
    p_venue_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_date DATE := CURRENT_DATE;
BEGIN
    INSERT INTO trivia_venue_analytics (
        venue_id,
        date,
        total_rooms,
        total_games,
        total_players,
        unique_players,
        avg_players_per_game,
        most_popular_category
    )
    SELECT
        COALESCE(p_venue_id, 0),
        v_date,
        COUNT(DISTINCT r.room_code),
        COUNT(DISTINCT g.id),
        SUM(g.total_players),
        COUNT(DISTINCT p.player_name),
        AVG(g.total_players),
        MODE() WITHIN GROUP (ORDER BY g.category)
    FROM trivia_rooms r
    LEFT JOIN trivia_games g ON r.room_code = g.room_code
    LEFT JOIN trivia_players p ON r.room_code = p.room_code
    WHERE DATE(r.created_at) = v_date
    AND (p_venue_id IS NULL OR r.venue_id = p_venue_id)
    ON CONFLICT (venue_id, date)
    DO UPDATE SET
        total_rooms = EXCLUDED.total_rooms,
        total_games = EXCLUDED.total_games,
        total_players = EXCLUDED.total_players,
        unique_players = EXCLUDED.unique_players,
        avg_players_per_game = EXCLUDED.avg_players_per_game,
        most_popular_category = EXCLUDED.most_popular_category;
END;
$$ LANGUAGE plpgsql;

-- Function to get leaderboard
CREATE OR REPLACE FUNCTION get_trivia_leaderboard(
    p_category VARCHAR(50) DEFAULT NULL,
    p_period VARCHAR(20) DEFAULT 'all',
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    rank BIGINT,
    player_name VARCHAR(100),
    best_score INTEGER,
    total_games INTEGER,
    win_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_scores AS (
        SELECT 
            s.player_name,
            MAX(s.score) as best_score,
            COUNT(*) as total_games,
            COUNT(*) FILTER (WHERE s.rank = 1) as wins
        FROM trivia_scores s
        JOIN trivia_games g ON s.game_id = g.id
        WHERE 
            (p_category IS NULL OR g.category = p_category)
            AND (
                p_period = 'all' OR
                (p_period = 'today' AND DATE(g.completed_at) = CURRENT_DATE) OR
                (p_period = 'week' AND g.completed_at >= CURRENT_DATE - INTERVAL '7 days') OR
                (p_period = 'month' AND g.completed_at >= CURRENT_DATE - INTERVAL '30 days')
            )
        GROUP BY s.player_name
    )
    SELECT 
        ROW_NUMBER() OVER (ORDER BY fs.best_score DESC) as rank,
        fs.player_name,
        fs.best_score,
        fs.total_games::INTEGER,
        ROUND((fs.wins::DECIMAL / fs.total_games * 100), 2) as win_rate
    FROM filtered_scores fs
    ORDER BY fs.best_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update player stats when score is recorded
CREATE OR REPLACE FUNCTION trigger_update_player_stats() RETURNS TRIGGER AS $$
BEGIN
    -- Get category from game
    DECLARE
        v_category VARCHAR(50);
    BEGIN
        SELECT category INTO v_category
        FROM trivia_games
        WHERE id = NEW.game_id;
        
        PERFORM update_trivia_player_stats(
            NEW.player_name,
            NEW.score,
            NEW.rank,
            v_category
        );
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_trivia_score_stats
AFTER INSERT ON trivia_scores
FOR EACH ROW
EXECUTE FUNCTION trigger_update_player_stats();

-- Trigger to update game player count
CREATE OR REPLACE FUNCTION trigger_update_game_player_count() RETURNS TRIGGER AS $$
BEGIN
    UPDATE trivia_games
    SET total_players = (
        SELECT COUNT(DISTINCT player_id)
        FROM trivia_scores
        WHERE game_id = NEW.game_id
    )
    WHERE id = NEW.game_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_trivia_game_player_count
AFTER INSERT ON trivia_scores
FOR EACH ROW
EXECUTE FUNCTION trigger_update_game_player_count();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active Rooms
CREATE VIEW active_trivia_rooms AS
SELECT 
    r.room_code,
    r.host_name,
    r.category,
    r.venue_id,
    COUNT(p.player_id) as player_count,
    r.created_at
FROM trivia_rooms r
LEFT JOIN trivia_players p ON r.room_code = p.room_code
WHERE r.active = true
AND r.completed_at IS NULL
GROUP BY r.room_code, r.host_name, r.category, r.venue_id, r.created_at
ORDER BY r.created_at DESC;

-- View: Recent Games
CREATE VIEW recent_trivia_games AS
SELECT 
    g.id,
    g.room_code,
    g.category,
    g.total_players,
    g.completed_at,
    (
        SELECT json_agg(json_build_object(
            'name', s.player_name,
            'score', s.score,
            'rank', s.rank
        ) ORDER BY s.rank)
        FROM trivia_scores s
        WHERE s.game_id = g.id
    ) as players
FROM trivia_games g
WHERE g.completed_at IS NOT NULL
ORDER BY g.completed_at DESC
LIMIT 50;

-- View: Player Leaderboard (All-Time)
CREATE VIEW trivia_all_time_leaderboard AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY best_score DESC) as rank,
    player_name,
    best_score,
    total_games,
    total_wins,
    ROUND((total_wins::DECIMAL / NULLIF(total_games, 0) * 100), 2) as win_rate,
    ROUND(avg_score, 2) as avg_score
FROM trivia_player_stats
ORDER BY best_score DESC
LIMIT 100;

-- View: Category Statistics
CREATE VIEW trivia_category_stats AS
SELECT 
    category,
    COUNT(*) as games_played,
    AVG(total_players) as avg_players,
    COUNT(DISTINCT g.room_code) as unique_rooms
FROM trivia_games g
GROUP BY category
ORDER BY games_played DESC;

-- View: Venue Performance
CREATE VIEW trivia_venue_performance AS
SELECT 
    venue_id,
    COUNT(DISTINCT room_code) as total_rooms,
    COUNT(DISTINCT room_code) FILTER (WHERE completed_at IS NOT NULL) as completed_rooms,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_game_duration_minutes
FROM trivia_rooms
WHERE venue_id IS NOT NULL
GROUP BY venue_id
ORDER BY total_rooms DESC;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert sample venue-specific questions (Chelsea FC example)
INSERT INTO trivia_questions (venue_id, category, question, answers, correct_answer, difficulty) VALUES
(123, 'sports', 'In which year was Chelsea FC founded?', 
 '["1903", "1905", "1910", "1915"]', 1, 2),
(123, 'sports', 'What is Chelsea FC''s home stadium?', 
 '["Emirates", "Stamford Bridge", "Anfield", "Old Trafford"]', 1, 1),
(123, 'sports', 'Which colour is Chelsea''s home kit?', 
 '["Red", "Blue", "White", "Green"]', 1, 1),
(123, 'sports', 'How many Premier League titles has Chelsea won?', 
 '["3", "4", "5", "6"]', 3, 2);

-- Insert sample restaurant questions
INSERT INTO trivia_questions (venue_id, category, question, answers, correct_answer, difficulty) VALUES
(456, 'food', 'What is a sommelier?', 
 '["Chef", "Wine Expert", "Dessert Maker", "Host"]', 1, 2),
(456, 'food', 'Which cut of beef is the most tender?', 
 '["Sirloin", "Ribeye", "Filet Mignon", "Chuck"]', 2, 2),
(456, 'food', 'What does ''al dente'' mean in cooking?', 
 '["Very soft", "Firm to bite", "Raw", "Burnt"]', 1, 2);

-- ============================================================================
-- UTILITY QUERIES
-- ============================================================================

-- Get player statistics
-- SELECT * FROM trivia_player_stats WHERE player_name = 'John';

-- Get leaderboard
-- SELECT * FROM get_trivia_leaderboard('sports', 'week', 10);

-- Get active rooms
-- SELECT * FROM active_trivia_rooms;

-- Get recent games
-- SELECT * FROM recent_trivia_games LIMIT 10;

-- Get venue analytics for today
-- SELECT * FROM trivia_venue_analytics WHERE date = CURRENT_DATE;

-- Update venue analytics
-- SELECT update_trivia_venue_analytics(123);

-- Get category popularity
-- SELECT * FROM trivia_category_stats;

-- Find top players by category
-- SELECT s.player_name, MAX(s.score) as best_score
-- FROM trivia_scores s
-- JOIN trivia_games g ON s.game_id = g.id
-- WHERE g.category = 'sports'
-- GROUP BY s.player_name
-- ORDER BY best_score DESC
-- LIMIT 10;

-- ============================================================================
-- MAINTENANCE QUERIES
-- ============================================================================

-- Clean up old inactive rooms (older than 24 hours)
-- DELETE FROM trivia_rooms 
-- WHERE active = false 
-- AND created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Clean up abandoned rooms (created but never completed, older than 2 hours)
-- UPDATE trivia_rooms
-- SET active = false
-- WHERE completed_at IS NULL
-- AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 hours';

-- Get database size info
-- SELECT 
--     table_name,
--     pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size
-- FROM (
--     SELECT table_name
--     FROM information_schema.tables
--     WHERE table_schema = 'public'
--     AND table_name LIKE 'trivia_%'
-- ) t
-- ORDER BY pg_total_relation_size(table_name::regclass) DESC;

-- Grant permissions
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_api_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_api_user;

-- Comments
COMMENT ON TABLE trivia_rooms IS 'Game rooms created by hosts for multiplayer games';
COMMENT ON TABLE trivia_players IS 'Players who have joined game rooms';
COMMENT ON TABLE trivia_games IS 'Completed game sessions with results';
COMMENT ON TABLE trivia_scores IS 'Individual player scores for each game';
COMMENT ON TABLE trivia_questions IS 'Custom questions per venue or category';
COMMENT ON TABLE trivia_player_stats IS 'Aggregated player statistics across all games';
COMMENT ON TABLE trivia_venue_analytics IS 'Daily analytics per venue for reporting';