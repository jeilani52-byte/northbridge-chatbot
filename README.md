# Northbridge Digital — AI Chatbot System

A full AI chatbot with live agent handoff for your website.

---

## What's included

- **AI Chat Widget** — Floating chat bubble on every page of your site
- **Aria AI Assistant** — Answers questions about your services, pricing, and more 24/7
- **Live Agent Handoff** — Customers can request a human; you take over from the admin dashboard
- **Admin Dashboard** — Real-time panel to manage all conversations (`/admin.html`)

---

## Setup (5 steps)

### Step 1 — Get an OpenAI API key
1. Go to https://platform.openai.com/api-keys
2. Sign up / log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)

> **Cost:** Using `gpt-4o-mini` costs roughly **$0.001 per conversation** — very cheap.

---

### Step 2 — Set up the server

1. Open the `chatbot/` folder
2. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
3. Edit `.env` and fill in your values:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ADMIN_PASSWORD=YourStrongPasswordHere
   PORT=3000
   ```

---

### Step 3 — Deploy the server (free options)

#### Option A: Railway (recommended — easiest)
1. Go to https://railway.app and sign up (free)
2. Click "New Project" → "Deploy from GitHub" (or "Empty Project")
3. Upload the `chatbot/` folder contents
4. Add your environment variables in Railway's "Variables" tab
5. Railway gives you a URL like `https://northbridge-chatbot-production.up.railway.app`

#### Option B: Render
1. Go to https://render.com and sign up (free)
2. New → Web Service → upload your code
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `node server.js`
5. Add environment variables in the "Environment" tab

#### Option C: Run locally (for testing)
```bash
cd chatbot
npm install
node server.js
# Server runs at http://localhost:3000
```

---

### Step 4 — Connect the widget to your site

Once your server is deployed and you have a URL (e.g. `https://my-chatbot.railway.app`):

1. Open each HTML file in your website (`index.html`, `services.html`, etc.)
2. Find these lines near the bottom (before `</body>`):
   ```html
   <!-- Replace YOUR_SERVER_URL with your deployed server address -->
   <script>
     window.NorthbridgeChat = {
       serverUrl: "https://YOUR_SERVER_URL"
     };
   </script>
   <script src="https://YOUR_SERVER_URL/widget.js" defer></script>
   ```
3. Replace **both** instances of `YOUR_SERVER_URL` with your actual server URL:
   ```html
   <script>
     window.NorthbridgeChat = {
       serverUrl: "https://my-chatbot.railway.app"
     };
   </script>
   <script src="https://my-chatbot.railway.app/widget.js" defer></script>
   ```

---

### Step 5 — Access the admin dashboard

1. Open your server URL + `/admin.html`:
   ```
   https://my-chatbot.railway.app/admin.html
   ```
2. Enter your `ADMIN_PASSWORD`
3. You'll see all live conversations in real-time

---

## How live agent handoff works

1. Customer chats with Aria (AI)
2. Customer clicks **"Request a live agent"** in the chat
3. **You get an alert** in the admin dashboard (sound + notification)
4. Click **"Take Over"** on the conversation
5. The customer is told a live agent has joined
6. You type replies directly in the dashboard
7. When done, click **"End Chat"** or **"Release"** (sends back to AI)

---

## Customizing the AI

To change what the AI knows or how it responds, open `server.js` and edit the `SYSTEM_PROMPT` variable. You can:
- Add new services you offer
- Update your pricing
- Change the bot's name or personality
- Add FAQs

---

## Customizing the widget appearance

At the top of each HTML page, you can pass options:
```html
<script>
  window.NorthbridgeChat = {
    serverUrl: "https://your-server.railway.app",
    botName: "Aria",                    // Bot name in header
    primaryColor: "#2563EB",            // Chat bubble color
    accentColor: "#F97316",             // Accent/CTA color
    greeting: "Hi! How can I help you?" // First message
  };
</script>
```

---

## File structure

```
chatbot/
├── server.js          ← Main Node.js server (AI + WebSocket)
├── package.json       ← Dependencies
├── .env               ← Your secret keys (don't share this!)
├── .env.example       ← Template for .env
└── public/
    ├── widget.js      ← Chat bubble that goes on your website
    └── admin.html     ← Your live agent dashboard
```

---

## Questions?

If you run into any issues during setup, the most common fix is making sure:
1. Your `OPENAI_API_KEY` is correct in the `.env` file
2. Your server URL in the HTML files matches exactly what Railway/Render gave you (no trailing slash)
3. You're using the `https://` version of your URL (not `http://`)
