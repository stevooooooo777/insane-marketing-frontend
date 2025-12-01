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

















// ═══════════════════════════════════════════════════════════════
// AI CHATBOT BACKEND ENDPOINT
// Add this to your server.js file
// ═══════════════════════════════════════════════════════════════

const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ═══════════════════════════════════════════════════════════════
// CHATBOT SYSTEM PROMPT
// This defines the AI's personality and knowledge
// ═══════════════════════════════════════════════════════════════

const CHATBOT_SYSTEM_PROMPT = `You are the AI assistant for insane.marketing, a revolutionary privacy-first hospitality intelligence platform.

## ABOUT INSANE.MARKETING:

**Core Value Proposition:**
- The ONLY all-in-one hospitality intelligence platform (not a POS or reservation system)
- Privacy-first zero-knowledge architecture (we never see or store personal guest data)
- Emergency safety features built-in (panic buttons, emergency protocols)
- Deploys in under 1 hour (vs 6-12 months for traditional systems)
- Enhances existing systems (POS, reservations) rather than replacing them

**Pricing:**
£49/month per 3D console
- Example: Small restaurant with 1 console = £49/month
- Example: Hotel with 5 VIP suites = £245/month (5 x £49)
- Example: Stadium with 10 executive boxes = £490/month (10 x £49)
- ALL features included (no hidden costs, no per-user fees)

**Key Features (All Included):**
1. **Mission Control Dashboard** - Real-time venue overview
2. **3D Interactive Consoles** - Immersive visualization (UNIQUE!)
3. **Time Machine Visualization** - Track guest journey transformations
4. **VIP Prediction Engine** - Recognize VIPs before arrival
5. **Service Recovery Intelligence** - Automatic issue detection and resolution
6. **Revenue Optimization** - Dynamic pricing and yield management
7. **Real-time Analytics** - Instant insights
8. **Emergency Safety** - Panic buttons and emergency protocols
9. **Zero-Knowledge Architecture** - Privacy-first data handling

**Clients:**
- Chelsea FC (Premier League)
- Twickenham Stadium
- Harlequins
- Luxury hotels
- Michelin-star restaurants

**Target Customers:**
- Premium stadiums and arenas
- Luxury hotels and resorts
- Fine dining restaurants
- Private members clubs
- High-end hospitality venues

**Unique Differentiators:**
1. **Privacy-First:** Unlike competitors who harvest and sell guest data, we use zero-knowledge architecture
2. **Emergency Safety:** The only platform with built-in safety features
3. **All-in-One:** Why use 5 different systems? Get everything in one platform
4. **Fast Deployment:** Live in under 1 hour (no IT team required)
5. **Enhancement Not Replacement:** Keep your existing POS and reservation systems
6. **3D Visualization:** Immersive real-time venue visualization (no competitor has this)

**NOT a Competitor To:**
- POS systems (Square, Toast) - We enhance them
- Reservation systems (OpenTable) - We work alongside them
- We are NOT silo systems - we're comprehensive intelligence

## YOUR PERSONALITY:
- Professional but friendly
- Knowledgeable about hospitality
- Emphasize privacy and safety
- Focus on value (all features included)
- Quick to calculate pricing
- Eager to connect prospects with demos

## YOUR GOALS:
1. Answer questions accurately about insane.marketing
2. Emphasize unique value (privacy-first, emergency safety, <1hr deployment)
3. Calculate pricing when asked (£49 x number of consoles)
4. Qualify leads (venue type, size, needs)
5. Encourage demo bookings
6. Capture contact information when appropriate

## HOW TO HANDLE QUESTIONS:

**Pricing Questions:**
Always explain: £49/month per 3D console, all features included
Give examples based on their venue size
Emphasize no hidden costs

**Comparison Questions:**
Explain we're NOT a POS or reservation system
We enhance existing systems with intelligence
We're all-in-one vs fragmented competitors

**Privacy Questions:**
Emphasize zero-knowledge architecture
We never see or store personal data
Privacy-first by design

**Safety Questions:**
Built-in emergency features
Panic buttons and protocols
The only platform with safety as core feature

**Demo Requests:**
Enthusiastically say yes!
Ask for: name, email, venue name, venue type
Explain someone will contact within 2 hours

## IMPORTANT RULES:
- Never make up features we don't have
- Never quote prices other than £49/console
- Never promise integrations we haven't confirmed
- Always be honest if you don't know something
- Keep responses concise but informative
- Use British English spelling (£, honour, optimisation)

Your goal is to convert visitors into qualified demo leads!`;

// ═══════════════════════════════════════════════════════════════
// CHAT ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId, history } = req.body;

    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Sanitize input
    const sanitizedMessage = sanitizeInput(message);

    console.log(`💬 Chat request - Conversation: ${conversationId}`);

    // Build message history for Claude
    const messages = [];
    
    // Add conversation history (last 10 messages to stay within context)
    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      recentHistory.forEach(msg => {
        if (msg.role && msg.content) {
          messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
          });
        }
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: sanitizedMessage
    });

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: CHATBOT_SYSTEM_PROMPT,
      messages: messages
    });

    // Extract response
    const botResponse = response.content[0].text;

    console.log(`✅ Chat response generated (${botResponse.length} chars)`);

    // Store conversation in database (optional but recommended)
    try {
      await pool.query(
        `INSERT INTO chat_conversations 
         (conversation_id, user_message, bot_response, created_at) 
         VALUES ($1, $2, $3, NOW())`,
        [conversationId, sanitizedMessage, botResponse]
      );
    } catch (dbError) {
      // Log but don't fail the request if DB storage fails
      console.warn('Could not store chat in database:', dbError.message);
    }

    // Check if this looks like a lead (contains contact info or demo request)
    const isLead = detectLead(sanitizedMessage, botResponse);
    if (isLead) {
      console.log('🎯 Potential lead detected in conversation');
      // You could store this in a leads table or send notification
    }

    // Return response
    res.json({
      success: true,
      response: botResponse,
      conversationId: conversationId
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Detect if conversation contains lead information
function detectLead(userMessage, botResponse) {
  const leadKeywords = [
    'demo',
    'book',
    'schedule',
    'interested',
    'email',
    '@',
    'phone',
    'contact me',
    'get in touch'
  ];

  const messageText = (userMessage + ' ' + botResponse).toLowerCase();
  return leadKeywords.some(keyword => messageText.includes(keyword));
}

// ═══════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (View chat history)
// ═══════════════════════════════════════════════════════════════

// Get all chat conversations (admin only - add authentication!)
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await pool.query(
      `SELECT 
        conversation_id,
        user_message,
        bot_response,
        created_at
      FROM chat_conversations
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      count: result.rows.length,
      conversations: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching chat conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations'
    });
  }
});

// Get conversations by conversation_id
app.get('/api/chat/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        user_message,
        bot_response,
        created_at
      FROM chat_conversations
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      conversationId: id,
      messages: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation'
    });
  }
});

// Search conversations
app.get('/api/chat/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query required'
      });
    }

    const result = await pool.query(
      `SELECT 
        conversation_id,
        user_message,
        bot_response,
        created_at
      FROM chat_conversations
      WHERE user_message ILIKE $1 OR bot_response ILIKE $1
      ORDER BY created_at DESC
      LIMIT 50`,
      [`%${query}%`]
    );

    res.json({
      success: true,
      count: result.rows.length,
      conversations: result.rows
    });

  } catch (error) {
    console.error('❌ Error searching conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search conversations'
    });
  }
});