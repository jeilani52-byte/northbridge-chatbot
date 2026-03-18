require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');
const nodemailer = require('nodemailer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────
// Email Notifications (Outlook SMTP via Nodemailer)
// ─────────────────────────────────────────────────────────────
const emailTransporter = (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS)
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS
      }
    })
  : null;

async function sendLiveAgentAlert(session) {
  if (!emailTransporter) {
    console.warn('[email] Skipping — GMAIL_USER / GMAIL_APP_PASS not set.');
    return;
  }
  const notifyTo = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER;
  const time = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' });
  const convo = session.messages
    .filter(m => m.role === 'user' || m.role === 'bot')
    .slice(-10) // last 10 messages for context
    .map(m => `${m.role === 'user' ? '👤 Visitor' : '🤖 Aria'}: ${m.content}`)
    .join('\n');

  const mailOptions = {
    from: `"Northbridge Chatbot" <${process.env.GMAIL_USER}>`,
    to: notifyTo,
    subject: `🔔 Live Agent Requested — ${session.meta.name} (${time})`,
    text: [
      `A visitor has requested a live agent on your chatbot.`,
      ``,
      `Time:     ${time}`,
      `Visitor:  ${session.meta.name}`,
      `Page:     ${session.meta.page}`,
      `Session:  ${session.id}`,
      ``,
      `─── Recent Conversation ───`,
      convo || '(no messages yet)',
      ``,
      `Log in to the admin panel to take over the chat.`
    ].join('\n')
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[email] Live agent alert sent to ${notifyTo}`);
  } catch (err) {
    console.error('[email] Failed to send alert:', err.message);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────
// In-memory session store
// session = {
//   id, messages, status ('bot'|'waiting'|'human'|'ended'),
//   customerSocket, agentSocket, meta: { name, page, startedAt }
// }
// ─────────────────────────────────────────────────────────────
const sessions = {};
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'northbridge2025';

// ─────────────────────────────────────────────────────────────
// AI System Prompt — trained on Northbridge Digital content
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Aria, a friendly and helpful AI assistant for Northbridge Digital — a Canadian company that builds custom AI chatbots for trades and home service businesses.

Your job is to help website visitors understand our services, answer their questions, and guide them toward booking a free demo or choosing a plan.

== ABOUT NORTHBRIDGE DIGITAL ==
We build AI chatbots specifically for HVAC, plumbing, electrical, roofing, construction, and other home service businesses. Our bots work 24/7 to capture leads, answer questions, and book appointments so business owners stop missing customers while they're on job sites.

== OUR SERVICES ==
• AI Chat Assistant — A custom-trained chatbot on the client's website that answers questions in real time
• Lead Capture & Email Alerts — Captures visitor contact info and instantly notifies the business owner
• Appointment Booking — Customers schedule directly through chat; syncs with Google Calendar
• Instant Quote Estimates — Bot gives ballpark estimates based on the business's pricing
• Missed Call Recovery — When a call goes unanswered, the bot follows up via text or web chat
• CRM Integration — Works with ServiceTitan, HouseCall Pro, Google Calendar, and more
• Smart Lead Reports — Every conversation is logged and summarized in a simple dashboard

== PRICING ==
Starter — $99/month + $250 one-time setup
  • AI chatbot on website
  • Lead capture & email alerts
  • Up to 200 conversations/month
  • Monthly performance report

Growth (Most Popular) — $197/month + $350 one-time setup
  • Everything in Starter
  • Appointment booking
  • Up to 600 conversations/month
  • CRM integration
  • Priority support

Scale — $349/month + $499 one-time setup
  • Everything in Growth
  • Unlimited conversations
  • Multi-location support
  • Dedicated account manager
  • Custom integrations

== HOW IT WORKS ==
1. Book a free 20-minute demo — we learn about the business and its customers
2. We build the chatbot in 24–48 hours — custom trained on the business's info
3. Go live and get leads — installed with one line of code; leads come in immediately

== RESULTS ==
• Average 3.2× more leads per month
• 94% of common customer questions answered automatically
• Live within 48 hours of signup
• Trusted by 40+ local trades businesses across Canada

== CONTACT ==
• Website contact form available on the contact page
• No phone number listed — use the contact form or book a demo

== RESPONSE GUIDELINES ==
• Be warm, conversational, and concise (3–4 sentences max unless more is needed)
• Never make up information not listed above
• If unsure, say you'll connect them with a team member
• Encourage visitors to book a free demo via the contact page
• If someone is ready to buy, guide them to the pricing page
• Use casual but professional language — like talking to a local business owner`;

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────
function getSafeSession(session) {
  return {
    id: session.id,
    status: session.status,
    messages: session.messages,
    meta: session.meta,
    hasAgent: !!session.agentSocket
  };
}

// ─────────────────────────────────────────────────────────────
// REST Routes
// ─────────────────────────────────────────────────────────────
app.post('/admin/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

app.get('/admin/sessions', (req, res) => {
  const auth = req.headers['x-admin-password'];
  if (auth !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const list = Object.values(sessions).map(getSafeSession);
  res.json(list);
});

// Health check for deployment platforms
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─────────────────────────────────────────────────────────────
// WebSocket / Socket.io
// ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── CUSTOMER ──────────────────────────────────────────────

  socket.on('customer:init', (data) => {
    const sessionId = data.sessionId || uuidv4();

    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        id: sessionId,
        messages: [],
        status: 'bot',
        customerSocket: socket.id,
        agentSocket: null,
        meta: {
          name: data.name || 'Visitor',
          page: data.page || '/',
          startedAt: new Date().toISOString()
        }
      };
    } else {
      // Reconnect existing session
      sessions[sessionId].customerSocket = socket.id;
    }

    socket.sessionId = sessionId;
    socket.role = 'customer';
    socket.join(`session:${sessionId}`);

    socket.emit('customer:init:ok', {
      sessionId,
      status: sessions[sessionId].status
    });

    // Notify admin panel
    io.to('admin').emit('admin:session:update', {
      session: getSafeSession(sessions[sessionId])
    });
  });

  socket.on('customer:message', async (data) => {
    const session = sessions[socket.sessionId];
    if (!session || session.status === 'ended') return;

    const userMsg = {
      role: 'user',
      content: data.message,
      timestamp: new Date().toISOString()
    };
    session.messages.push(userMsg);

    // Always notify admin of new messages
    io.to('admin').emit('admin:session:update', { session: getSafeSession(session) });
    io.to('admin').emit('admin:customer:message', { sessionId: session.id, message: userMsg });

    // If a human agent is handling this session, don't use AI
    if (session.status === 'human') return;

    // If waiting for agent, send a holding message
    if (session.status === 'waiting') {
      socket.emit('bot:message', {
        content: "Thanks for your patience! Our team has been notified. Feel free to keep typing and we'll see it when we connect.",
        timestamp: new Date().toISOString(),
        type: 'system'
      });
      return;
    }

    // ── AI Response ──
    socket.emit('bot:typing', true);

    try {
      // Build message history for OpenAI
      const aiMessages = session.messages
        .filter(m => m.role === 'user' || m.role === 'bot')
        .map(m => ({
          role: m.role === 'bot' ? 'assistant' : 'user',
          content: m.content
        }));

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...aiMessages],
        max_tokens: 320,
        temperature: 0.7
      });

      const reply = completion.choices[0].message.content.trim();
      const botMsg = { role: 'bot', content: reply, timestamp: new Date().toISOString() };
      session.messages.push(botMsg);

      socket.emit('bot:typing', false);
      socket.emit('bot:message', { content: reply, timestamp: botMsg.timestamp, type: 'bot' });

      io.to('admin').emit('admin:session:update', { session: getSafeSession(session) });

    } catch (err) {
      console.error('OpenAI error:', err.message);
      socket.emit('bot:typing', false);
      socket.emit('bot:message', {
        content: "Sorry, I'm having a brief issue. You can reach us directly through our contact form, or try again in a moment!",
        timestamp: new Date().toISOString(),
        type: 'bot'
      });
    }
  });

  socket.on('customer:request:human', () => {
    const session = sessions[socket.sessionId];
    if (!session || session.status !== 'bot') return;

    session.status = 'waiting';
    session.messages.push({
      role: 'system',
      content: 'Customer requested a live agent.',
      timestamp: new Date().toISOString()
    });

    socket.emit('bot:message', {
      content: "Sure! I've notified our team and someone will be with you shortly. During business hours the wait is usually under 5 minutes.",
      timestamp: new Date().toISOString(),
      type: 'system'
    });

    // Ping all admins with an alert
    io.to('admin').emit('admin:human:requested', { session: getSafeSession(session) });

    // Send email notification to owner
    sendLiveAgentAlert(session);
  });

  // ── ADMIN ─────────────────────────────────────────────────

  socket.on('admin:auth', (data) => {
    if (data.password !== ADMIN_PASSWORD) {
      socket.emit('admin:auth:fail', { message: 'Invalid password' });
      return;
    }
    socket.role = 'admin';
    socket.join('admin');

    const allSessions = Object.values(sessions).map(getSafeSession);
    socket.emit('admin:auth:ok', { sessions: allSessions });
    console.log(`[admin] Admin connected: ${socket.id}`);
  });

  socket.on('admin:take:session', (data) => {
    if (socket.role !== 'admin') return;
    const session = sessions[data.sessionId];
    if (!session) return;

    session.status = 'human';
    session.agentSocket = socket.id;
    socket.activeSession = data.sessionId;

    session.messages.push({
      role: 'system',
      content: 'Live agent connected.',
      timestamp: new Date().toISOString()
    });

    // Tell the customer
    io.to(`session:${data.sessionId}`).emit('bot:message', {
      content: "You're now connected with a live agent from Northbridge Digital! How can I help you today?",
      timestamp: new Date().toISOString(),
      type: 'agent'
    });

    socket.emit('admin:session:taken', { sessionId: data.sessionId });
    io.to('admin').emit('admin:session:update', { session: getSafeSession(session) });
  });

  socket.on('admin:message', (data) => {
    if (socket.role !== 'admin') return;
    const session = sessions[data.sessionId];
    if (!session || session.status !== 'human') return;

    const agentMsg = {
      role: 'agent',
      content: data.message,
      timestamp: new Date().toISOString()
    };
    session.messages.push(agentMsg);

    // Send to customer
    io.to(`session:${data.sessionId}`).emit('agent:message', {
      content: data.message,
      timestamp: agentMsg.timestamp
    });

    // Update all admins
    io.to('admin').emit('admin:session:update', { session: getSafeSession(session) });
  });

  socket.on('admin:typing', (data) => {
    if (socket.role !== 'admin') return;
    io.to(`session:${data.sessionId}`).emit('agent:typing', data.isTyping);
  });

  socket.on('admin:end:session', (data) => {
    if (socket.role !== 'admin') return;
    const session = sessions[data.sessionId];
    if (!session) return;

    session.status = 'ended';
    session.messages.push({
      role: 'system',
      content: 'Session ended by agent.',
      timestamp: new Date().toISOString()
    });

    io.to(`session:${data.sessionId}`).emit('bot:message', {
      content: "Thanks for chatting with us! If you have any more questions, feel free to start a new conversation. Have a great day! 👋",
      timestamp: new Date().toISOString(),
      type: 'system'
    });

    io.to('admin').emit('admin:session:update', { session: getSafeSession(session) });

    // Clean up after 2 hours
    setTimeout(() => delete sessions[data.sessionId], 7200000);
  });

  socket.on('admin:release:session', (data) => {
    if (socket.role !== 'admin') return;
    const session = sessions[data.sessionId];
    if (!session) return;

    session.status = 'bot';
    session.agentSocket = null;

    session.messages.push({
      role: 'system',
      content: 'Agent disconnected. AI assistant resumed.',
      timestamp: new Date().toISOString()
    });

    io.to(`session:${data.sessionId}`).emit('bot:message', {
      content: "Our agent had to step away, but I'm back! Is there anything else I can help you with?",
      timestamp: new Date().toISOString(),
      type: 'bot'
    });

    io.to('admin').emit('admin:session:update', { session: getSafeSession(session) });
  });

  // ── DISCONNECT ────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    if (socket.role === 'customer' && socket.sessionId) {
      const session = sessions[socket.sessionId];
      if (session && session.status !== 'ended') {
        io.to('admin').emit('admin:customer:disconnected', { sessionId: socket.sessionId });
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Northbridge Chatbot Server running on port ${PORT}`);
  console.log(`📊 Admin Panel: http://localhost:${PORT}/admin.html`);
  console.log(`🔑 Admin Password: ${ADMIN_PASSWORD}\n`);
});
