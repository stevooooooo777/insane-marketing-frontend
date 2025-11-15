// ============================================================================
// WORDLE & SPIN THE WHEEL API ENDPOINTS
// Node.js/Express Implementation for Railway Deployment
// ============================================================================

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'https://insane.marketing' }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ============================================================================
// WORDLE API ENDPOINTS
// ============================================================================

/**
 * GET /api/wordle/today
 * Get today's Wordle challenge
 * 
 * Response:
 * {
 *   "date": "2025-11-07",
 *   "word_id": 123,
 *   "has_played": false,
 *   "spins_left": 3
 * }
 * 
 * Note: Does NOT send the actual word to prevent cheating
 */
app.get('/api/wordle/today', async (req, res) => {
  const { user_id } = req.query;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get or create today's word
    let wordResult = await pool.query(
      'SELECT id FROM wordle_daily_words WHERE date = $1',
      [today]
    );
    
    if (wordResult.rows.length === 0) {
      // Generate new word for today (you'd select from a word list)
      const wordList = await pool.query(
        'SELECT word FROM word_list ORDER BY RANDOM() LIMIT 1'
      );
      
      wordResult = await pool.query(
        `INSERT INTO wordle_daily_words (word, date) 
         VALUES ($1, $2) 
         RETURNING id`,
        [wordList.rows[0]?.word || 'REACT', today]
      );
    }
    
    const wordId = wordResult.rows[0].id;
    
    // Check if user has already played today
    let hasPlayed = false;
    if (user_id) {
      const playCheck = await pool.query(
        `SELECT id FROM wordle_game_sessions 
         WHERE user_identifier = $1 
         AND word_id = $2 
         AND completed_at IS NOT NULL`,
        [user_id, wordId]
      );
      hasPlayed = playCheck.rows.length > 0;
    }
    
    res.json({
      date: today,
      word_id: wordId,
      has_played: hasPlayed
    });
    
  } catch (error) {
    console.error('Error fetching today\'s word:', error);
    res.status(500).json({ error: 'Failed to fetch daily word' });
  }
});

/**
 * POST /api/wordle/start
 * Start a new Wordle game session
 * 
 * Body:
 * {
 *   "user_identifier": "user123",
 *   "venue_id": 456 (optional)
 * }
 * 
 * Response:
 * {
 *   "session_token": "abc123...",
 *   "session_id": 789
 * }
 */
app.post('/api/wordle/start', async (req, res) => {
  const { user_identifier, venue_id } = req.body;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's word ID
    const wordResult = await pool.query(
      'SELECT id FROM wordle_daily_words WHERE date = $1',
      [today]
    );
    
    if (wordResult.rows.length === 0) {
      return res.status(400).json({ error: 'No word available for today' });
    }
    
    const session_token = crypto.randomBytes(32).toString('hex');
    
    const result = await pool.query(
      `INSERT INTO wordle_game_sessions 
       (session_token, word_id, user_identifier, venue_id, ip_address) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [session_token, wordResult.rows[0].id, user_identifier, venue_id, req.ip]
    );
    
    res.json({
      session_token,
      session_id: result.rows[0].id
    });
    
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

/**
 * POST /api/wordle/guess
 * Submit a guess and get evaluation
 * 
 * Body:
 * {
 *   "session_token": "abc123...",
 *   "guess": "REACT"
 * }
 * 
 * Response:
 * {
 *   "evaluation": ["correct", "present", "absent", "correct", "correct"],
 *   "is_correct": false,
 *   "guesses_remaining": 4
 * }
 */
app.post('/api/wordle/guess', async (req, res) => {
  const { session_token, guess } = req.body;
  
  try {
    // Validate guess
    if (!guess || guess.length !== 5) {
      return res.status(400).json({ error: 'Invalid guess length' });
    }
    
    // Get session and word
    const sessionResult = await pool.query(
      `SELECT s.id, s.guesses, w.word 
       FROM wordle_game_sessions s
       JOIN wordle_daily_words w ON s.word_id = w.id
       WHERE s.session_token = $1 AND s.completed_at IS NULL`,
      [session_token]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or already completed' });
    }
    
    const { id: session_id, guesses, word } = sessionResult.rows[0];
    const guessArray = guesses || [];
    
    // Evaluate guess
    const evaluation = evaluateGuess(guess, word);
    const isCorrect = guess === word;
    
    // Store guess
    guessArray.push({ guess, evaluation });
    
    await pool.query(
      'UPDATE wordle_game_sessions SET guesses = $1 WHERE id = $2',
      [JSON.stringify(guessArray), session_id]
    );
    
    res.json({
      evaluation,
      is_correct: isCorrect,
      guesses_remaining: 6 - guessArray.length
    });
    
  } catch (error) {
    console.error('Error processing guess:', error);
    res.status(500).json({ error: 'Failed to process guess' });
  }
});

/**
 * POST /api/wordle/complete
 * Complete a game and save results
 * 
 * Body:
 * {
 *   "session_token": "abc123...",
 *   "won": true,
 *   "guesses_count": 4
 * }
 */
app.post('/api/wordle/complete', async (req, res) => {
  const { session_token, won, guesses_count } = req.body;
  
  try {
    const sessionResult = await pool.query(
      `SELECT id, user_identifier FROM wordle_game_sessions 
       WHERE session_token = $1`,
      [session_token]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const { id: session_id, user_identifier } = sessionResult.rows[0];
    
    // Update session
    await pool.query(
      `UPDATE wordle_game_sessions 
       SET completed_at = CURRENT_TIMESTAMP, won = $1, guesses_count = $2 
       WHERE id = $3`,
      [won, guesses_count, session_id]
    );
    
    // Update player stats
    await pool.query(
      'SELECT update_wordle_stats($1, $2, $3)',
      [user_identifier, won, guesses_count]
    );
    
    // Get updated stats
    const statsResult = await pool.query(
      `SELECT games_played, games_won, current_streak, max_streak 
       FROM wordle_player_stats 
       WHERE user_identifier = $1`,
      [user_identifier]
    );
    
    res.json({
      success: true,
      stats: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error completing game:', error);
    res.status(500).json({ error: 'Failed to complete game' });
  }
});

/**
 * GET /api/wordle/stats/:user_id
 * Get player statistics
 */
app.get('/api/wordle/stats/:user_id', async (req, res) => {
  const { user_id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT * FROM wordle_player_stats WHERE user_identifier = $1`,
      [user_id]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        games_played: 0,
        games_won: 0,
        current_streak: 0,
        max_streak: 0
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Helper function to evaluate a guess
function evaluateGuess(guess, solution) {
  const evaluation = Array(5).fill('absent');
  const solutionLetters = solution.split('');
  const guessLetters = guess.split('');
  
  // First pass: mark correct positions
  guessLetters.forEach((letter, i) => {
    if (letter === solutionLetters[i]) {
      evaluation[i] = 'correct';
      solutionLetters[i] = null;
    }
  });
  
  // Second pass: mark present letters
  guessLetters.forEach((letter, i) => {
    if (evaluation[i] === 'absent' && solutionLetters.includes(letter)) {
      evaluation[i] = 'present';
      solutionLetters[solutionLetters.indexOf(letter)] = null;
    }
  });
  
  return evaluation;
}

// ============================================================================
// SPIN THE WHEEL API ENDPOINTS
// ============================================================================

/**
 * GET /api/spin-wheel/check-spins/:user_id
 * Check how many spins a user has left today
 * 
 * Response:
 * {
 *   "spins_remaining": 2,
 *   "max_spins": 3,
 *   "next_reset": "2025-11-08T00:00:00Z"
 * }
 */
app.get('/api/spin-wheel/check-spins/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { venue_id } = req.query;
  
  try {
    const result = await pool.query(
      'SELECT check_spin_limit($1, $2) as spins_remaining',
      [user_id, venue_id ? 5 : 3] // Example: VIP venues get more spins
    );
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    res.json({
      spins_remaining: result.rows[0].spins_remaining,
      max_spins: venue_id ? 5 : 3,
      next_reset: tomorrow.toISOString()
    });
    
  } catch (error) {
    console.error('Error checking spins:', error);
    res.status(500).json({ error: 'Failed to check spins' });
  }
});

/**
 * GET /api/spin-wheel/prizes
 * Get available prizes for a venue
 * 
 * Query params:
 * - venue_id: optional venue ID
 * 
 * Response:
 * {
 *   "prizes": [
 *     {
 *       "id": 1,
 *       "label": "10% OFF",
 *       "emoji": "💰",
 *       "description": "10% discount on your entire bill",
 *       "color": "#ef4444",
 *       "probability": 25
 *     }
 *   ]
 * }
 */
app.get('/api/spin-wheel/prizes', async (req, res) => {
  const { venue_id } = req.query;
  
  try {
    let query = `
      SELECT id, label, prize_value as value, emoji, description, color, probability
      FROM wheel_prizes
      WHERE active = TRUE
    `;
    
    const params = [];
    
    if (venue_id) {
      query += ' AND (venue_id = $1 OR venue_id IS NULL)';
      params.push(venue_id);
    } else {
      query += ' AND venue_id IS NULL';
    }
    
    query += ' ORDER BY probability DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      prizes: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching prizes:', error);
    res.status(500).json({ error: 'Failed to fetch prizes' });
  }
});

/**
 * POST /api/spin-wheel/spin
 * Record a spin and award a prize
 * 
 * Body:
 * {
 *   "user_identifier": "user123",
 *   "prize_id": 1,
 *   "venue_id": 456 (optional)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "prize": {
 *     "id": 1,
 *     "label": "10% OFF",
 *     "value": "10",
 *     "description": "10% discount on your entire bill",
 *     "code": "OFF1234ABC5678",
 *     "expires_at": "2025-11-14T00:00:00Z"
 *   },
 *   "spins_remaining": 2
 * }
 */
app.post('/api/spin-wheel/spin', async (req, res) => {
  const { user_identifier, prize_id, venue_id } = req.body;
  
  try {
    // Generate unique prize code
    const prize_code = generatePrizeCode();
    
    // Record the spin using the database function
    const recordResult = await pool.query(
      'SELECT record_wheel_spin($1, $2, $3, $4) as success',
      [user_identifier, prize_id, prize_code, venue_id]
    );
    
    if (!recordResult.rows[0].success) {
      return res.status(400).json({ error: 'No spins remaining' });
    }
    
    // Get prize details
    const prizeResult = await pool.query(
      `SELECT id, label, prize_value as value, description, expiry_days
       FROM wheel_prizes WHERE id = $1`,
      [prize_id]
    );
    
    const prize = prizeResult.rows[0];
    
    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + prize.expiry_days);
    
    // Check remaining spins
    const spinsResult = await pool.query(
      'SELECT check_spin_limit($1) as spins_remaining',
      [user_identifier]
    );
    
    res.json({
      success: true,
      prize: {
        ...prize,
        code: prize_code,
        expires_at: expiresAt.toISOString()
      },
      spins_remaining: spinsResult.rows[0].spins_remaining
    });
    
    // Update analytics asynchronously
    pool.query('SELECT update_wheel_analytics($1)', [venue_id])
      .catch(err => console.error('Error updating analytics:', err));
    
  } catch (error) {
    console.error('Error recording spin:', error);
    res.status(500).json({ error: 'Failed to record spin' });
  }
});

/**
 * POST /api/spin-wheel/redeem
 * Redeem a prize (staff endpoint)
 * 
 * Body:
 * {
 *   "prize_code": "OFF1234ABC5678",
 *   "staff_id": "staff789"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "prize": {
 *     "label": "10% OFF",
 *     "value": "10",
 *     "description": "10% discount on your entire bill"
 *   }
 * }
 */
app.post('/api/spin-wheel/redeem', async (req, res) => {
  const { prize_code, staff_id } = req.body;
  
  try {
    // Validate and redeem prize
    const redeemResult = await pool.query(
      'SELECT redeem_wheel_prize($1, $2) as success',
      [prize_code, staff_id]
    );
    
    if (!redeemResult.rows[0].success) {
      return res.status(400).json({ 
        error: 'Invalid or expired prize code' 
      });
    }
    
    // Get prize details
    const prizeResult = await pool.query(
      `SELECT p.label, p.prize_value as value, p.description
       FROM wheel_spins s
       JOIN wheel_prizes p ON s.prize_id = p.id
       WHERE s.prize_code = $1`,
      [prize_code]
    );
    
    res.json({
      success: true,
      prize: prizeResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error redeeming prize:', error);
    res.status(500).json({ error: 'Failed to redeem prize' });
  }
});

/**
 * GET /api/spin-wheel/verify/:prize_code
 * Verify a prize code without redeeming (for staff to check)
 * 
 * Response:
 * {
 *   "valid": true,
 *   "prize": {
 *     "label": "10% OFF",
 *     "value": "10",
 *     "description": "10% discount on your entire bill"
 *   },
 *   "redeemed": false,
 *   "won_at": "2025-11-07T14:30:00Z",
 *   "expires_at": "2025-11-14T00:00:00Z"
 * }
 */
app.get('/api/spin-wheel/verify/:prize_code', async (req, res) => {
  const { prize_code } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT 
        s.redeemed,
        s.spun_at as won_at,
        p.label,
        p.prize_value as value,
        p.description,
        p.expiry_days,
        (s.spun_at + (p.expiry_days || ' days')::interval) as expires_at
       FROM wheel_spins s
       JOIN wheel_prizes p ON s.prize_id = p.id
       WHERE s.prize_code = $1`,
      [prize_code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        valid: false,
        error: 'Prize code not found' 
      });
    }
    
    const prize = result.rows[0];
    const isExpired = new Date(prize.expires_at) < new Date();
    
    res.json({
      valid: !isExpired && !prize.redeemed,
      prize: {
        label: prize.label,
        value: prize.value,
        description: prize.description
      },
      redeemed: prize.redeemed,
      won_at: prize.won_at,
      expires_at: prize.expires_at,
      expired: isExpired
    });
    
  } catch (error) {
    console.error('Error verifying prize:', error);
    res.status(500).json({ error: 'Failed to verify prize' });
  }
});

/**
 * GET /api/spin-wheel/analytics
 * Get wheel analytics (admin endpoint)
 * 
 * Query params:
 * - venue_id: optional
 * - days: number of days to fetch (default 7)
 */
app.get('/api/spin-wheel/analytics', async (req, res) => {
  const { venue_id, days = 7 } = req.query;
  
  try {
    let query = `
      SELECT * FROM wheel_analytics
      WHERE date >= CURRENT_DATE - $1::integer
    `;
    
    const params = [days];
    
    if (venue_id) {
      query += ' AND venue_id = $2';
      params.push(venue_id);
    }
    
    query += ' ORDER BY date DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      analytics: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Helper function to generate prize codes
function generatePrizeCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${timestamp}${random}`;
}

// ============================================================================
// COMBINED ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/games/user-overview/:user_id
 * Get combined game statistics for a user
 */
app.get('/api/games/user-overview/:user_id', async (req, res) => {
  const { user_id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM user_engagement_overview WHERE user_id = $1',
      [user_id]
    );
    
    res.json(result.rows[0] || {
      user_id,
      wordle_games: 0,
      wordle_wins: 0,
      wheel_spins: 0,
      prizes_redeemed: 0,
      last_activity: null
    });
    
  } catch (error) {
    console.error('Error fetching user overview:', error);
    res.status(500).json({ error: 'Failed to fetch user overview' });
  }
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Games API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ============================================================================
// DEPLOYMENT NOTES
// ============================================================================

/*
RAILWAY DEPLOYMENT CHECKLIST:

1. Environment Variables Required:
   - DATABASE_URL (PostgreSQL connection string)
   - ALLOWED_ORIGIN (your Netlify domain)
   - PORT (automatically set by Railway)
   - NODE_ENV=production

2. Package.json dependencies:
   {
     "dependencies": {
       "express": "^4.18.2",
       "pg": "^8.11.0",
       "cors": "^2.8.5",
       "crypto": "built-in"
     }
   }

3. Update HTML files with your Railway API URL:
   - wordle-game.html: Replace YOUR_API_ENDPOINT
   - spin-wheel-game.html: Replace YOUR_API_ENDPOINT

4. Security Recommendations:
   - Add rate limiting for spin endpoints
   - Implement JWT authentication for admin endpoints
   - Add request validation middleware
   - Enable HTTPS only
   - Add API key for staff redemption endpoints

5. Testing Endpoints:
   - Use Postman or curl to test each endpoint
   - Verify prize code generation is unique
   - Test spin limits reset at midnight
   - Validate Wordle daily word generation
*/