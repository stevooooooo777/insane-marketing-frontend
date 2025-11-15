// ============================================================================
// REAL-TIME MULTIPLAYER TRIVIA SERVER
// WebSocket implementation with Socket.io for instant synchronization
// ============================================================================

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || "https://insane.marketing",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "https://insane.marketing" }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// In-memory room management (for active games)
const rooms = new Map();
// Structure: roomCode -> { host, players[], gameState, category, questions[], currentQuestion, started, venueId }

// Question bank with multiple categories
const questionBank = {
  general: [
    { question: "What is the capital of France?", answers: ["London", "Berlin", "Paris", "Madrid"], correct: 2, difficulty: 1 },
    { question: "Which planet is known as the Red Planet?", answers: ["Venus", "Mars", "Jupiter", "Saturn"], correct: 1, difficulty: 1 },
    { question: "Who painted the Mona Lisa?", answers: ["Van Gogh", "Picasso", "Da Vinci", "Michelangelo"], correct: 2, difficulty: 2 },
    { question: "What is the largest ocean on Earth?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3, difficulty: 1 },
    { question: "In which year did World War II end?", answers: ["1943", "1944", "1945", "1946"], correct: 2, difficulty: 2 },
    { question: "What is the smallest country in the world?", answers: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correct: 1, difficulty: 2 },
    { question: "Which element has the chemical symbol 'Au'?", answers: ["Silver", "Gold", "Copper", "Aluminum"], correct: 1, difficulty: 2 },
    { question: "How many continents are there?", answers: ["5", "6", "7", "8"], correct: 2, difficulty: 1 },
    { question: "What is the fastest land animal?", answers: ["Lion", "Cheetah", "Leopard", "Horse"], correct: 1, difficulty: 1 },
    { question: "Which country has the largest population?", answers: ["India", "USA", "China", "Indonesia"], correct: 2, difficulty: 1 }
  ],
  sports: [
    { question: "How many players are on a football team?", answers: ["9", "10", "11", "12"], correct: 2, difficulty: 1 },
    { question: "Which country won the 2018 FIFA World Cup?", answers: ["Brazil", "Germany", "France", "Argentina"], correct: 2, difficulty: 2 },
    { question: "In tennis, what is a score of zero called?", answers: ["Love", "Nil", "Zero", "Nothing"], correct: 0, difficulty: 2 },
    { question: "How many Grand Slam tournaments are there in tennis?", answers: ["3", "4", "5", "6"], correct: 1, difficulty: 2 },
    { question: "What sport is played at Wimbledon?", answers: ["Cricket", "Tennis", "Golf", "Rugby"], correct: 1, difficulty: 1 },
    { question: "How many points is a touchdown worth in American football?", answers: ["5", "6", "7", "8"], correct: 1, difficulty: 2 },
    { question: "Which country hosts the Premier League?", answers: ["Spain", "Italy", "England", "Germany"], correct: 2, difficulty: 1 },
    { question: "How long is an Olympic swimming pool?", answers: ["25m", "50m", "75m", "100m"], correct: 1, difficulty: 2 },
    { question: "In basketball, how many points is a free throw worth?", answers: ["1", "2", "3", "4"], correct: 0, difficulty: 1 },
    { question: "Which sport uses a puck?", answers: ["Cricket", "Baseball", "Ice Hockey", "Lacrosse"], correct: 2, difficulty: 1 }
  ],
  entertainment: [
    { question: "Who directed 'Jurassic Park'?", answers: ["George Lucas", "Steven Spielberg", "James Cameron", "Peter Jackson"], correct: 1, difficulty: 2 },
    { question: "Which band released 'Bohemian Rhapsody'?", answers: ["The Beatles", "Led Zeppelin", "Queen", "Pink Floyd"], correct: 2, difficulty: 1 },
    { question: "What is the highest-grossing film of all time?", answers: ["Titanic", "Avatar", "Avengers: Endgame", "Star Wars"], correct: 1, difficulty: 2 },
    { question: "Who played Iron Man in the Marvel movies?", answers: ["Chris Evans", "Chris Hemsworth", "Robert Downey Jr", "Mark Ruffalo"], correct: 2, difficulty: 1 },
    { question: "Which streaming service created 'Stranger Things'?", answers: ["Hulu", "Amazon Prime", "Netflix", "Disney+"], correct: 2, difficulty: 1 },
    { question: "Who won the first season of American Idol?", answers: ["Carrie Underwood", "Kelly Clarkson", "Adam Lambert", "Jennifer Hudson"], correct: 1, difficulty: 2 },
    { question: "What is the name of Harry Potter's owl?", answers: ["Hedwig", "Scabbers", "Crookshanks", "Fang"], correct: 0, difficulty: 1 },
    { question: "Which actor played James Bond the most times?", answers: ["Sean Connery", "Pierce Brosnan", "Roger Moore", "Daniel Craig"], correct: 2, difficulty: 3 },
    { question: "What year was the first iPhone released?", answers: ["2005", "2007", "2009", "2011"], correct: 1, difficulty: 2 },
    { question: "Who sang 'Rolling in the Deep'?", answers: ["Adele", "Beyoncé", "Lady Gaga", "Taylor Swift"], correct: 0, difficulty: 1 }
  ],
  food: [
    { question: "What is the main ingredient in hummus?", answers: ["Lentils", "Chickpeas", "White Beans", "Black Beans"], correct: 1, difficulty: 2 },
    { question: "Which country invented pizza?", answers: ["Greece", "France", "Italy", "Spain"], correct: 2, difficulty: 1 },
    { question: "What type of pastry are profiteroles made from?", answers: ["Puff pastry", "Filo pastry", "Choux pastry", "Shortcrust pastry"], correct: 2, difficulty: 3 },
    { question: "What is the most expensive spice in the world?", answers: ["Vanilla", "Cardamom", "Saffron", "Black Truffle"], correct: 2, difficulty: 2 },
    { question: "Which fruit has the most vitamin C?", answers: ["Orange", "Lemon", "Kiwi", "Strawberry"], correct: 2, difficulty: 2 },
    { question: "What does IPA stand for in beer?", answers: ["Indian Pale Ale", "International Premium Ale", "Irish Pub Ale", "Imperial Porter Ale"], correct: 0, difficulty: 2 },
    { question: "Which country is the largest producer of coffee?", answers: ["Colombia", "Vietnam", "Brazil", "Ethiopia"], correct: 2, difficulty: 2 },
    { question: "What is the main ingredient in a traditional Japanese miso soup?", answers: ["Tofu", "Seaweed", "Soybean paste", "Fish"], correct: 2, difficulty: 2 },
    { question: "How many Michelin stars can a restaurant receive?", answers: ["2", "3", "4", "5"], correct: 1, difficulty: 1 },
    { question: "What is the primary ingredient in guacamole?", answers: ["Tomato", "Pepper", "Avocado", "Onion"], correct: 2, difficulty: 1 }
  ]
};

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // CREATE ROOM
  socket.on('create_room', async (data) => {
    const { playerName, category, venueId } = data;
    const roomCode = generateRoomCode();
    
    const room = {
      code: roomCode,
      host: socket.id,
      hostName: playerName,
      players: [{
        id: socket.id,
        name: playerName,
        score: 0,
        ready: true,
        currentAnswer: null,
        answerTime: null
      }],
      category: category || 'general',
      questions: [],
      currentQuestion: 0,
      started: false,
      venueId: venueId || null,
      createdAt: new Date(),
      questionStartTime: null
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    // Save room to database
    try {
      await pool.query(
        `INSERT INTO trivia_rooms (room_code, host_id, host_name, category, venue_id) 
         VALUES ($1, $2, $3, $4, $5)`,
        [roomCode, socket.id, playerName, category, venueId]
      );
    } catch (error) {
      console.error('Error saving room:', error);
    }
    
    socket.emit('room_created', {
      roomCode,
      isHost: true,
      players: room.players
    });
    
    console.log(`Room created: ${roomCode} by ${playerName}`);
  });

  // JOIN ROOM
  socket.on('join_room', async (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.started) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    
    // Check if player name already exists
    if (room.players.some(p => p.name === playerName)) {
      socket.emit('error', { message: 'Name already taken in this room' });
      return;
    }
    
    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      ready: true,
      currentAnswer: null,
      answerTime: null
    };
    
    room.players.push(player);
    socket.join(roomCode);
    
    // Save player to database
    try {
      await pool.query(
        `INSERT INTO trivia_players (room_code, player_id, player_name) 
         VALUES ($1, $2, $3)`,
        [roomCode, socket.id, playerName]
      );
    } catch (error) {
      console.error('Error saving player:', error);
    }
    
    // Notify all players in room
    io.to(roomCode).emit('player_joined', {
      player,
      players: room.players
    });
    
    // Send room info to joining player
    socket.emit('room_joined', {
      roomCode,
      isHost: false,
      players: room.players,
      hostName: room.hostName
    });
    
    console.log(`${playerName} joined room ${roomCode}`);
  });

  // START GAME
  socket.on('start_game', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    
    if (!room || room.host !== socket.id) {
      socket.emit('error', { message: 'Only host can start game' });
      return;
    }
    
    if (room.players.length < 1) {
      socket.emit('error', { message: 'Need at least 1 player' });
      return;
    }
    
    // Select and shuffle questions
    const questions = shuffleArray([...questionBank[room.category]]).slice(0, 10);
    room.questions = questions;
    room.currentQuestion = 0;
    room.started = true;
    
    // Reset all player scores
    room.players.forEach(p => {
      p.score = 0;
      p.currentAnswer = null;
      p.answerTime = null;
    });
    
    // Notify all players game is starting
    io.to(roomCode).emit('game_started', {
      totalQuestions: questions.length
    });
    
    console.log(`Game started in room ${roomCode}`);
    
    // Send first question after 2 second delay
    setTimeout(() => {
      sendQuestion(roomCode);
    }, 2000);
  });

  // SUBMIT ANSWER
  socket.on('submit_answer', async (data) => {
    const { roomCode, answerIndex, timeLeft } = data;
    const room = rooms.get(roomCode);
    
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.currentAnswer !== null) return; // Already answered
    
    const question = room.questions[room.currentQuestion];
    const isCorrect = answerIndex === question.correct;
    
    // Calculate score
    let points = 0;
    if (isCorrect) {
      const basePoints = 100;
      const timeBonus = Math.floor(timeLeft * 10); // 10 points per second remaining
      points = basePoints + timeBonus;
      player.score += points;
    }
    
    player.currentAnswer = answerIndex;
    player.answerTime = Date.now() - room.questionStartTime;
    
    // Send feedback to player
    socket.emit('answer_result', {
      correct: isCorrect,
      correctAnswer: question.correct,
      points,
      newScore: player.score
    });
    
    // Update all players on who has answered
    io.to(roomCode).emit('player_answered', {
      playerName: player.name,
      playerId: player.id
    });
    
    // Check if all players have answered
    const allAnswered = room.players.every(p => p.currentAnswer !== null);
    
    if (allAnswered) {
      // Send live scores to all
      io.to(roomCode).emit('scores_update', {
        players: room.players.map(p => ({
          name: p.name,
          score: p.score
        })).sort((a, b) => b.score - a.score)
      });
      
      // Move to next question after delay
      setTimeout(() => {
        room.currentQuestion++;
        
        // Reset answer states
        room.players.forEach(p => {
          p.currentAnswer = null;
          p.answerTime = null;
        });
        
        if (room.currentQuestion < room.questions.length) {
          sendQuestion(roomCode);
        } else {
          endGame(roomCode);
        }
      }, 3000);
    }
  });

  // LEAVE ROOM
  socket.on('leave_room', (data) => {
    const { roomCode } = data;
    handlePlayerLeave(socket.id, roomCode);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Find and handle any rooms this player was in
    rooms.forEach((room, roomCode) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        handlePlayerLeave(socket.id, roomCode);
      }
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function sendQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const question = room.questions[room.currentQuestion];
  room.questionStartTime = Date.now();
  
  // Send question to all players (without correct answer)
  io.to(roomCode).emit('new_question', {
    questionNumber: room.currentQuestion + 1,
    totalQuestions: room.questions.length,
    question: question.question,
    answers: question.answers,
    timeLimit: 15
  });
  
  // Auto-advance after time limit + buffer
  setTimeout(() => {
    const currentRoom = rooms.get(roomCode);
    if (!currentRoom) return;
    
    // Mark players who didn't answer as having answered incorrectly
    currentRoom.players.forEach(p => {
      if (p.currentAnswer === null) {
        p.currentAnswer = -1; // Timeout indicator
      }
    });
    
    // Send scores update
    io.to(roomCode).emit('scores_update', {
      players: currentRoom.players.map(p => ({
        name: p.name,
        score: p.score
      })).sort((a, b) => b.score - a.score)
    });
    
    // Move to next question
    setTimeout(() => {
      currentRoom.currentQuestion++;
      
      // Reset answer states
      currentRoom.players.forEach(p => {
        p.currentAnswer = null;
        p.answerTime = null;
      });
      
      if (currentRoom.currentQuestion < currentRoom.questions.length) {
        sendQuestion(roomCode);
      } else {
        endGame(roomCode);
      }
    }, 2000);
    
  }, 16000); // 15s question time + 1s buffer
}

async function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  // Sort players by score
  const finalStandings = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      score: p.score
    }));
  
  // Send final results to all players
  io.to(roomCode).emit('game_ended', {
    standings: finalStandings
  });
  
  // Save game results to database
  try {
    const gameResult = await pool.query(
      `INSERT INTO trivia_games (room_code, category, total_questions, completed_at) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
       RETURNING id`,
      [roomCode, room.category, room.questions.length]
    );
    
    const gameId = gameResult.rows[0].id;
    
    // Save player scores
    for (const player of room.players) {
      await pool.query(
        `INSERT INTO trivia_scores (game_id, player_id, player_name, score, rank) 
         VALUES ($1, $2, $3, $4, $5)`,
        [gameId, player.id, player.name, player.score, 
         finalStandings.findIndex(s => s.name === player.name) + 1]
      );
    }
    
    await pool.query(
      `UPDATE trivia_rooms SET completed_at = CURRENT_TIMESTAMP WHERE room_code = $1`,
      [roomCode]
    );
    
  } catch (error) {
    console.error('Error saving game results:', error);
  }
  
  console.log(`Game ended in room ${roomCode}`);
  
  // Clean up room after 5 minutes
  setTimeout(() => {
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} cleaned up`);
  }, 300000);
}

function handlePlayerLeave(playerId, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return;
  
  const player = room.players[playerIndex];
  room.players.splice(playerIndex, 1);
  
  // If host left, assign new host or close room
  if (room.host === playerId) {
    if (room.players.length > 0) {
      room.host = room.players[0].id;
      io.to(roomCode).emit('new_host', {
        hostId: room.host,
        hostName: room.players[0].name
      });
    } else {
      // No players left, delete room
      rooms.delete(roomCode);
      return;
    }
  }
  
  // Notify remaining players
  io.to(roomCode).emit('player_left', {
    playerName: player.name,
    players: room.players
  });
}

function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// REST API ENDPOINTS (for stats and leaderboards)
// ============================================================================

// Get room info
app.get('/api/trivia/room/:code', async (req, res) => {
  const { code } = req.params;
  const room = rooms.get(code);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    code: room.code,
    hostName: room.hostName,
    category: room.category,
    playerCount: room.players.length,
    started: room.started
  });
});

// Get leaderboard
app.get('/api/trivia/leaderboard', async (req, res) => {
  const { category, limit = 10, period = 'all' } = req.query;
  
  try {
    let query = `
      SELECT 
        player_name,
        MAX(score) as best_score,
        COUNT(*) as games_played,
        AVG(score) as avg_score
      FROM trivia_scores s
      JOIN trivia_games g ON s.game_id = g.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (category && category !== 'all') {
      params.push(category);
      query += ` AND g.category = $${params.length}`;
    }
    
    if (period === 'today') {
      query += ` AND g.completed_at >= CURRENT_DATE`;
    } else if (period === 'week') {
      query += ` AND g.completed_at >= CURRENT_DATE - INTERVAL '7 days'`;
    }
    
    query += `
      GROUP BY player_name
      ORDER BY best_score DESC
      LIMIT $${params.length + 1}
    `;
    
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

// Get player stats
app.get('/api/trivia/stats/:playerName', async (req, res) => {
  const { playerName } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_games,
        MAX(score) as best_score,
        AVG(score) as avg_score,
        COUNT(*) FILTER (WHERE rank = 1) as wins
       FROM trivia_scores
       WHERE player_name = $1`,
      [playerName]
    );
    
    res.json(result.rows[0] || {
      total_games: 0,
      best_score: 0,
      avg_score: 0,
      wins: 0
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get active rooms count
app.get('/api/trivia/active-rooms', (req, res) => {
  res.json({
    activeRooms: rooms.size,
    totalPlayers: Array.from(rooms.values()).reduce((sum, room) => sum + room.players.length, 0)
  });
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Trivia server running on port ${PORT}`);
  console.log(`🎮 WebSocket server ready`);
  console.log(`📊 REST API available at /api/trivia/*`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    pool.end();
    console.log('Server closed');
  });
});

// ============================================================================
// EXPORT FOR TESTING
// ============================================================================

module.exports = { app, httpServer, io };