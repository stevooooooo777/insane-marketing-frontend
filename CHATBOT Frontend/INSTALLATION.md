# Frontend Widget Installation

## Step 1: Update the Railway URL

Open `chatbot-widget.html` and find **line 500** (around there):

```javascript
const API_URL = 'https://your-backend.railway.app';
```

**Change it to YOUR Railway backend URL:**
```javascript
const API_URL = 'https://your-actual-url.up.railway.app';
```

To find your Railway URL:
1. Go to Railway dashboard
2. Click your backend service
3. Go to Settings → Networking
4. Copy the public URL

---

## Step 2: Add to Your Website

**Option A: Copy the entire file into your index.html**

1. Open `chatbot-widget.html`
2. Copy ALL of it
3. Open your website's `index.html` (or main template)
4. Find the closing `</body>` tag
5. Paste the widget code BEFORE the `</body>` tag
6. Save

**Option B: Link to it as an external file (cleaner)**

1. Upload `chatbot-widget.html` to your Netlify site
2. In your main `index.html`, add this before `</body>`:
   ```html
   <script src="/chatbot-widget.html" defer></script>
   ```

---

## Step 3: Deploy

Push to Netlify:
```bash
git add .
git commit -m "Add AI chatbot"
git push
```

Or drag and drop your folder to Netlify.

---

## Test It

1. Open your website
2. Look for purple chat bubble in bottom-right corner
3. Click it
4. Type a message
5. Get a response!

---

## Troubleshooting

**No chat bubble:**
- Check browser console for errors
- Make sure code is before `</body>` tag

**"Failed to get response":**
- Wrong Railway URL (check line 500 again)
- Backend not running
- Check Railway logs

---

That's it!
