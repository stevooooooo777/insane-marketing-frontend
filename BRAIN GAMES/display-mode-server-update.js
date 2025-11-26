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























// ============================================================================
// ADD THIS TO YOUR TRIVIA-WEBSOCKET-SERVER.JS
// Insert after the existing socket event handlers
// ============================================================================

// DISPLAY MODE SUPPORT - Add these event handlers to your Socket.IO connection

socket.on('join_as_display', async (data) => {
  const { roomCode } = data;
  const room = rooms.get(roomCode);
  
  if (!room) {
    socket.emit('error', { message: 'Room not found' });
    return;
  }
  
  // Join room as observer (doesn't count as player)
  socket.join(roomCode);
  
  // Mark this socket as a display
  socket.displayMode = true;
  socket.displayRoom = roomCode;
  
  console.log(`Display connected to room ${roomCode}`);
  
  // Send current room state to display
  socket.emit('display_update', {
    players: room.players.map(p => ({ name: p.name, score: p.score })),
    started: room.started,
    currentQuestion: room.currentQuestion
  });
  
  // If game is in progress, send current question
  if (room.started && room.currentQuestion < room.questions.length) {
    const question = room.questions[room.currentQuestion];
    socket.emit('new_question', {
      questionNumber: room.currentQuestion + 1,
      totalQuestions: room.questions.length,
      question: question.question,
      answers: question.answers,
      timeLimit: 15
    });
  }
});

// Update the sendQuestion function to also notify displays
function sendQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const question = room.questions[room.currentQuestion];
  room.questionStartTime = Date.now();
  
  // Send question to ALL clients in room (players AND displays)
  io.to(roomCode).emit('new_question', {
    questionNumber: room.currentQuestion + 1,
    totalQuestions: room.questions.length,
    question: question.question,
    answers: question.answers,
    timeLimit: 15
  });
  
  // ... rest of sendQuestion function remains the same
}

// Update scores_update emission to show correct answer on display
// Modify your existing scores_update emit like this:
io.to(roomCode).emit('scores_update', {
  players: room.players.map(p => ({
    name: p.name,
    score: p.score
  })).sort((a, b) => b.score - a.score),
  correctAnswer: question.correct  // Add this line
});

// ============================================================================
// OPTIONAL: Display-specific announcements
// ============================================================================

// When player joins, send to displays
io.to(roomCode).emit('player_joined', {
  player: player,
  players: room.players,
  displayAnnouncement: `${player.name} joined!`  // For display to show
});

// When player leaves
io.to(roomCode).emit('player_left', {
  playerName: player.name,
  players: room.players,
  displayAnnouncement: `${player.name} left`
});

// ============================================================================
// USAGE NOTES
// ============================================================================

/*
Display Mode Features:
1. Joins room as observer (doesn't count as player)
2. Receives all game events in real-time
3. Shows questions, answers, scores
4. Shows winner podium at end
5. Auto-returns to waiting after game

To connect a display:
1. Open trivia-display-mode.html on TV/screen
2. Enter the room code
3. Display automatically syncs

URL Parameters:
- ?venue=Chelsea%20FC - Shows venue branding
- ?autoconnect=B7X2 - Auto-connects to room code

Example URL:
https://insane.marketing/games/trivia-display.html?venue=Chelsea%20FC

*/