

/*!
 * ═══════════════════════════════════════════════════════════════
 * insane.marketing - Luxury Hospitality Intelligence Platform
 * ═══════════════════════════════════════════════════════════════
 * 
 * Copyright (c) 2024-2025 insane.marketing
 * All Rights Reserved - Proprietary and Confidential

 * 
 * NOTICE: This code contains proprietary business logic and trade secrets.
 * 
 * Unauthorized use, reproduction, or distribution of this code,
 * or any portion of it, may result in severe civil and criminal penalties,
 * and will be prosecuted to the maximum extent possible under the law.

 * 
 * Key Protected Features:
 * - Zero-Knowledge Architecture & Data Handling
 * - Time Machine Transformation Visualization System
 * - VIP Prediction & Recognition Engine
 * - Service Recovery Intelligence System
 * - Real-time Mission Control Analytics

 * Protected by AI tracking - active
 * For licensing inquiries: steve@insane.marketing

 * ═══════════════════════════════════════════════════════════════
 */

























// Brain Games API Endpoints Documentation
// Connect your Netlify frontend to Railway PostgreSQL backend

/* ============================================================================
   REQUIRED API ENDPOINTS
   ============================================================================ */

/**
 * 1. START NEW GAME SESSION
 * POST /api/brain-games/session/start
 * 
 * Request Body:
 * {
 *   "category": "logic",
 *   "user_identifier": "anonymous_12345" or user email/id,
 *   "venue_id": 123 (optional - link to your venue system)
 * }
 * 
 * Response:
 * {
 *   "session_token": "abc123xyz789",
 *   "session_id": 456,
 *   "questions": [
 *     {
 *       "id": 1,
 *       "question_text": "If all Bloops are Razzies...",
 *       "answers": ["True", "False", "Cannot be determined", "Only sometimes"],
 *       // Note: Don't send correct_answer_index to frontend!
 *     }
 *   ]
 * }
 */

/**
 * 2. SUBMIT ANSWER
 * POST /api/brain-games/answer
 * 
 * Request Body:
 * {
 *   "session_token": "abc123xyz789",
 *   "question_id": 1,
 *   "selected_answer_index": 0,
 *   "time_taken": 15
 * }
 * 
 * Response:
 * {
 *   "is_correct": true,
 *   "correct_answer_index": 0,
 *   "explanation": "This follows the transitive property of logic.",
 *   "current_score": 215,
 *   "current_streak": 3
 * }
 */

/**
 * 3. COMPLETE GAME & SAVE SCORE
 * POST /api/brain-games/scores
 * 
 * Request Body:
 * {
 *   "session_token": "abc123xyz789",
 *   "category": "logic",
 *   "score": 1250,
 *   "correct_answers": 8,
 *   "best_streak": 5,
 *   "time_bonus": 250,
 *   "completion_time": 180
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "score_id": 789,
 *   "rank": 12,
 *   "message": "Score saved successfully!"
 * }
 */

/**
 * 4. GET LEADERBOARD
 * GET /api/brain-games/leaderboard?category=logic&limit=10&period=today
 * 
 * Query Parameters:
 * - category: "logic", "trivia", "memory", or "all"
 * - limit: number of results (default 10)
 * - period: "today", "week", "month", "all"
 * 
 * Response:
 * {
 *   "leaderboard": [
 *     {
 *       "rank": 1,
 *       "user_identifier": "Player_123",
 *       "score": 1450,
 *       "correct_answers": 10,
 *       "played_at": "2025-11-07T10:30:00Z"
 *     }
 *   ]
 * }
 */

/**
 * 5. GET QUESTION ANALYTICS (Admin)
 * GET /api/brain-games/admin/question-stats
 * 
 * Response:
 * {
 *   "questions": [
 *     {
 *       "id": 1,
 *       "question_text": "...",
 *       "category": "Logic & Reasoning",
 *       "times_shown": 150,
 *       "times_correct": 89,
 *       "success_rate": 59.33
 *     }
 *   ]
 * }
 */

/* ============================================================================
   EXAMPLE NODE.JS/EXPRESS IMPLEMENTATION
   ============================================================================ */

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// PostgreSQL connection (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ============================================================================
// ENDPOINT 1: Start New Game Session
// ============================================================================
app.post('/api/brain-games/session/start', async (req, res) => {
  const { category, user_identifier, venue_id } = req.body;
  
  try {
    // Generate session token
    const session_token = crypto.randomBytes(32).toString('hex');
    
    // Get category ID
    const categoryResult = await pool.query(
      'SELECT id FROM brain_game_categories WHERE name = $1',
      [category]
    );
    
    if (categoryResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const category_id = categoryResult.rows[0].id;
    
    // Create session
    const sessionResult = await pool.query(
      `INSERT INTO brain_game_sessions 
       (session_token, venue_id, user_identifier, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [session_token, venue_id, user_identifier, req.ip, req.headers['user-agent']]
    );
    
    const session_id = sessionResult.rows[0].id;
    
    // Get random questions for this category
    const questionsResult = await pool.query(
      `SELECT id, question_text, answers 
       FROM brain_game_questions 
       WHERE category_id = $1 AND active = true 
       ORDER BY RANDOM() 
       LIMIT 10`,
      [category_id]
    );
    
    // Format questions (remove correct_answer_index)
    const questions = questionsResult.rows.map(q => ({
      id: q.id,
      question_text: q.question_text,
      answers: q.answers
    }));
    
    res.json({
      session_token,
      session_id,
      questions
    });
    
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start game session' });
  }
});

// ============================================================================
// ENDPOINT 2: Submit Answer
// ============================================================================
app.post('/api/brain-games/answer', async (req, res) => {
  const { session_token, question_id, selected_answer_index, time_taken } = req.body;
  
  try {
    // Verify session
    const sessionResult = await pool.query(
      'SELECT id FROM brain_game_sessions WHERE session_token = $1',
      [session_token]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const session_id = sessionResult.rows[0].id;
    
    // Get correct answer
    const questionResult = await pool.query(
      `SELECT correct_answer_index, explanation 
       FROM brain_game_questions 
       WHERE id = $1`,
      [question_id]
    );
    
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    const { correct_answer_index, explanation } = questionResult.rows[0];
    const is_correct = selected_answer_index === correct_answer_index;
    
    // Record answer
    await pool.query(
      `INSERT INTO brain_game_answers 
       (session_id, question_id, selected_answer_index, is_correct, time_taken) 
       VALUES ($1, $2, $3, $4, $5)`,
      [session_id, question_id, selected_answer_index, is_correct, time_taken]
    );
    
    // Calculate current score and streak
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total_answered,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_count
       FROM brain_game_answers 
       WHERE session_id = $1`,
      [session_id]
    );
    
    res.json({
      is_correct,
      correct_answer_index,
      explanation,
      stats: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// ============================================================================
// ENDPOINT 3: Save Final Score
// ============================================================================
app.post('/api/brain-games/scores', async (req, res) => {
  const { 
    session_token, 
    category, 
    score, 
    correct_answers, 
    best_streak, 
    time_bonus,
    completion_time 
  } = req.body;
  
  try {
    // Verify session and get session_id
    const sessionResult = await pool.query(
      `SELECT id, user_identifier 
       FROM brain_game_sessions 
       WHERE session_token = $1`,
      [session_token]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const { id: session_id, user_identifier } = sessionResult.rows[0];
    
    // Get category ID
    const categoryResult = await pool.query(
      'SELECT id FROM brain_game_categories WHERE name = $1',
      [category]
    );
    
    const category_id = categoryResult.rows[0].id;
    
    // Save score
    const scoreResult = await pool.query(
      `INSERT INTO brain_game_scores 
       (session_id, category_id, score, correct_answers, best_streak, time_bonus, completion_time) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id`,
      [session_id, category_id, score, correct_answers, best_streak, time_bonus, completion_time]
    );
    
    // Update session completion
    await pool.query(
      `UPDATE brain_game_sessions 
       SET completed_at = CURRENT_TIMESTAMP, total_duration = $1 
       WHERE id = $2`,
      [completion_time, session_id]
    );
    
    // Update leaderboard
    await pool.query(
      'SELECT update_leaderboard($1, $2, $3)',
      [category_id, user_identifier, score]
    );
    
    // Refresh ranks
    await pool.query('SELECT refresh_leaderboard_ranks()');
    
    // Get player's rank
    const rankResult = await pool.query(
      `SELECT rank FROM brain_game_leaderboard 
       WHERE category_id = $1 AND user_identifier = $2`,
      [category_id, user_identifier]
    );
    
    const rank = rankResult.rows[0]?.rank || null;
    
    res.json({
      success: true,
      score_id: scoreResult.rows[0].id,
      rank,
      message: 'Score saved successfully!'
    });
    
  } catch (error) {
    console.error('Error saving score:', error);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// ============================================================================
// ENDPOINT 4: Get Leaderboard
// ============================================================================
app.get('/api/brain-games/leaderboard', async (req, res) => {
  const { category = 'all', limit = 10, period = 'all' } = req.query;
  
  try {
    let query = `
      SELECT 
        l.rank,
        l.user_identifier,
        l.best_score as score,
        l.total_games,
        l.last_played as played_at,
        c.display_name as category
      FROM brain_game_leaderboard l
      JOIN brain_game_categories c ON l.category_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by category
    if (category !== 'all') {
      params.push(category);
      query += ` AND c.name = $${params.length}`;
    }
    
    // Filter by time period
    if (period === 'today') {
      query += ` AND l.last_played >= CURRENT_DATE`;
    } else if (period === 'week') {
      query += ` AND l.last_played >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      query += ` AND l.last_played >= CURRENT_DATE - INTERVAL '30 days'`;
    }
    
    query += ` ORDER BY l.rank LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    
    res.json({
      leaderboard: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ============================================================================
// ENDPOINT 5: Admin - Question Statistics
// ============================================================================
app.get('/api/brain-games/admin/question-stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM question_stats ORDER BY success_rate ASC');
    
    res.json({
      questions: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching question stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ============================================================================
// ENDPOINT 6: Game Analytics Dashboard
// ============================================================================
app.get('/api/brain-games/admin/analytics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM game_analytics 
      ORDER BY play_date DESC 
      LIMIT 30
    `);
    
    res.json({
      analytics: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Brain Games API running on port ${PORT}`);
});

/* ============================================================================
   SECURITY CONSIDERATIONS
   ============================================================================ */

/*
1. Add CORS configuration:
   app.use(cors({ origin: 'https://insane.marketing' }));

2. Add rate limiting:
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
   app.use('/api/', limiter);

3. Validate all inputs with a library like 'joi'

4. Add authentication for admin endpoints

5. Use environment variables for database credentials

6. Enable HTTPS only in production

7. Sanitize user_identifier to prevent injection

8. Add request logging and monitoring
*/

/* ============================================================================
   DEPLOYMENT CHECKLIST
   ============================================================================ */

/*
1. ✅ Deploy SQL schema to Railway PostgreSQL
2. ✅ Deploy API backend to Railway
3. ✅ Update brain-games.html with your API endpoint URLs
4. ✅ Deploy HTML file to Netlify
5. ✅ Configure CORS to allow Netlify domain
6. ✅ Test all endpoints with Postman
7. ✅ Monitor database performance and add indexes if needed
8. ✅ Set up analytics tracking
9. ✅ Add backup strategy for PostgreSQL database
10. ✅ Configure SSL/TLS certificates
*/