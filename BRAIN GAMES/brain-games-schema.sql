-- Brain Games Database Schema for PostgreSQL
-- Deploy this to your Railway PostgreSQL database

-- Table: brain_game_categories
CREATE TABLE brain_game_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_emoji VARCHAR(10),
    color_gradient VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: brain_game_questions
CREATE TABLE brain_game_questions (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES brain_game_categories(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    answers JSONB NOT NULL, -- Array of answer options
    correct_answer_index INTEGER NOT NULL,
    explanation TEXT,
    difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
    times_shown INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: brain_game_sessions
CREATE TABLE brain_game_sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(255) UNIQUE,
    venue_id INTEGER, -- Link to your existing venue system if needed
    user_identifier VARCHAR(255), -- Anonymous or logged-in user
    ip_address INET,
    user_agent TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    total_duration INTEGER -- in seconds
);

-- Table: brain_game_scores
CREATE TABLE brain_game_scores (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES brain_game_sessions(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES brain_game_categories(id),
    score INTEGER NOT NULL DEFAULT 0,
    correct_answers INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 10,
    best_streak INTEGER DEFAULT 0,
    time_bonus INTEGER DEFAULT 0,
    completion_time INTEGER, -- seconds taken to complete
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: brain_game_answers
-- Track individual question attempts for analytics
CREATE TABLE brain_game_answers (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES brain_game_sessions(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES brain_game_questions(id),
    selected_answer_index INTEGER,
    is_correct BOOLEAN,
    time_taken INTEGER, -- seconds to answer
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: brain_game_leaderboard
-- Materialized view for performance - refresh periodically
CREATE TABLE brain_game_leaderboard (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES brain_game_categories(id),
    user_identifier VARCHAR(255),
    best_score INTEGER NOT NULL,
    total_games INTEGER DEFAULT 1,
    average_score DECIMAL(10,2),
    last_played TIMESTAMP,
    rank INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, user_identifier)
);

-- Indexes for performance
CREATE INDEX idx_questions_category ON brain_game_questions(category_id);
CREATE INDEX idx_questions_active ON brain_game_questions(active);
CREATE INDEX idx_scores_session ON brain_game_scores(session_id);
CREATE INDEX idx_scores_category ON brain_game_scores(category_id);
CREATE INDEX idx_scores_created ON brain_game_scores(created_at DESC);
CREATE INDEX idx_answers_session ON brain_game_answers(session_id);
CREATE INDEX idx_answers_question ON brain_game_answers(question_id);
CREATE INDEX idx_leaderboard_category_rank ON brain_game_leaderboard(category_id, rank);
CREATE INDEX idx_sessions_token ON brain_game_sessions(session_token);

-- Insert default categories
INSERT INTO brain_game_categories (name, display_name, description, icon_emoji, color_gradient) VALUES
('logic', 'Logic & Reasoning', 'Test your logical thinking and problem-solving skills', '🎯', 'from-purple-500 to-indigo-600'),
('trivia', 'General Knowledge', 'Challenge yourself with world knowledge and facts', '🌍', 'from-blue-500 to-cyan-600'),
('memory', 'Memory Challenge', 'Train your memory with sequences and patterns', '💭', 'from-pink-500 to-rose-600');

-- Sample questions (you can expand this)
INSERT INTO brain_game_questions (category_id, question_text, answers, correct_answer_index, explanation, difficulty_level) VALUES
(1, 'If all Bloops are Razzies and all Razzies are Lazzies, then all Bloops are definitely Lazzies?', 
 '["True", "False", "Cannot be determined", "Only sometimes"]', 0, 
 'This follows the transitive property of logic.', 2),

(1, 'A bat and ball cost $1.10. The bat costs $1 more than the ball. How much does the ball cost?',
 '["$0.10", "$0.05", "$0.15", "$0.20"]', 1,
 'If ball = x, then bat = x + 1. So x + (x + 1) = 1.10, meaning 2x = 0.10, x = 0.05', 3),

(2, 'What is the capital of Australia?',
 '["Sydney", "Melbourne", "Canberra", "Brisbane"]', 2,
 'Canberra is Australia''s capital city.', 1),

(3, 'Study this sequence: 7, 14, 3, 9, 21. What was the third number?',
 '["3", "9", "14", "7"]', 0,
 'The sequence was: 7, 14, 3, 9, 21', 2);

-- Function to update leaderboard
CREATE OR REPLACE FUNCTION update_leaderboard(
    p_category_id INTEGER,
    p_user_identifier VARCHAR(255),
    p_score INTEGER
) RETURNS VOID AS $$
BEGIN
    INSERT INTO brain_game_leaderboard (category_id, user_identifier, best_score, total_games, average_score, last_played)
    VALUES (p_category_id, p_user_identifier, p_score, 1, p_score, CURRENT_TIMESTAMP)
    ON CONFLICT (category_id, user_identifier) 
    DO UPDATE SET
        best_score = CASE 
            WHEN EXCLUDED.best_score > brain_game_leaderboard.best_score 
            THEN EXCLUDED.best_score 
            ELSE brain_game_leaderboard.best_score 
        END,
        total_games = brain_game_leaderboard.total_games + 1,
        average_score = (brain_game_leaderboard.average_score * brain_game_leaderboard.total_games + EXCLUDED.best_score) / (brain_game_leaderboard.total_games + 1),
        last_played = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate ranks
CREATE OR REPLACE FUNCTION refresh_leaderboard_ranks() RETURNS VOID AS $$
BEGIN
    UPDATE brain_game_leaderboard
    SET rank = subquery.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY best_score DESC) as rank
        FROM brain_game_leaderboard
    ) AS subquery
    WHERE brain_game_leaderboard.id = subquery.id;
END;
$$ LANGUAGE plpgsql;

-- View for daily leaderboard
CREATE VIEW daily_leaderboard AS
SELECT 
    c.display_name as category,
    l.user_identifier,
    l.best_score,
    l.rank
FROM brain_game_leaderboard l
JOIN brain_game_categories c ON l.category_id = c.id
WHERE l.last_played >= CURRENT_DATE
ORDER BY c.id, l.rank
LIMIT 100;

-- View for question statistics
CREATE VIEW question_stats AS
SELECT 
    q.id,
    q.question_text,
    c.display_name as category,
    q.difficulty_level,
    q.times_shown,
    q.times_correct,
    CASE 
        WHEN q.times_shown > 0 
        THEN ROUND((q.times_correct::DECIMAL / q.times_shown * 100), 2)
        ELSE 0 
    END as success_rate
FROM brain_game_questions q
JOIN brain_game_categories c ON q.category_id = c.id
WHERE q.active = true;

-- Trigger to update question statistics
CREATE OR REPLACE FUNCTION update_question_stats() RETURNS TRIGGER AS $$
BEGIN
    UPDATE brain_game_questions
    SET 
        times_shown = times_shown + 1,
        times_correct = times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_question_stats
AFTER INSERT ON brain_game_answers
FOR EACH ROW
EXECUTE FUNCTION update_question_stats();

-- Add some analytics views
CREATE VIEW game_analytics AS
SELECT 
    DATE(s.started_at) as play_date,
    c.display_name as category,
    COUNT(DISTINCT s.id) as total_games,
    COUNT(DISTINCT s.user_identifier) as unique_players,
    AVG(sc.score) as avg_score,
    MAX(sc.score) as high_score,
    AVG(sc.completion_time) as avg_completion_time
FROM brain_game_sessions s
JOIN brain_game_scores sc ON s.id = sc.session_id
JOIN brain_game_categories c ON sc.category_id = c.id
WHERE s.completed_at IS NOT NULL
GROUP BY DATE(s.started_at), c.display_name
ORDER BY play_date DESC;

-- Comments for documentation
COMMENT ON TABLE brain_game_questions IS 'Stores all quiz questions with answers in JSONB format';
COMMENT ON TABLE brain_game_sessions IS 'Tracks individual game sessions for analytics';
COMMENT ON TABLE brain_game_scores IS 'Records final scores for completed games';
COMMENT ON TABLE brain_game_answers IS 'Logs each question attempt for detailed analytics';
COMMENT ON TABLE brain_game_leaderboard IS 'Maintains best scores and rankings per category';

-- Grant permissions (adjust based on your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_api_user;