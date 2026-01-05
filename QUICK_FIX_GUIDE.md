# Quick Fix Guide - Frontend to Backend Connection

## ✅ What's Already Fixed

### Frontend API URLs Updated
All frontend files now point to production backend:
- ✅ `frontend/src/App.jsx` → `https://ai-glasses-backend.onrender.com`
- ✅ `frontend/api-test.html` → `https://ai-glasses-backend.onrender.com`
- ✅ `frontend/render-tool.html` → `https://ai-glasses-backend.onrender.com`

### Backend Homepage Routes Added
The backend now has proper homepage routes:
- ✅ `GET /` → Returns service info JSON
- ✅ `GET /health` → Returns health status JSON

**Note:** These routes need to be deployed to Render to take effect.

---

## 🚀 Deploy Backend Changes

The homepage routes are in your code but not deployed yet. To deploy:

```bash
# Commit and push changes
git add backend/server.mjs
git commit -m "Add health check and homepage endpoints"
git push origin main
```

Render will auto-deploy in ~2 minutes. Then test:

```bash
# Should return service info JSON
curl https://ai-glasses-backend.onrender.com/

# Should return health status
curl https://ai-glasses-backend.onrender.com/health
```

---

## 🎯 Deploy Frontend

Your frontend is ready to deploy! All API URLs are configured.

### Option 1: Vercel (Recommended)
```bash
cd frontend
npm install -g vercel
vercel deploy
```

### Option 2: Netlify
```bash
cd frontend
npm run build
# Upload dist/ folder to Netlify
```

### Option 3: Test Locally First
```bash
cd frontend
npm run dev
# Open http://localhost:5174
# Upload images and test AI matching
```

---

## 🧪 Test the Connection

### Test 1: Backend API
```bash
curl https://ai-glasses-backend.onrender.com/models
```
Expected: JSON array with 167 models

### Test 2: Frontend to Backend
1. Run frontend: `npm run dev`
2. Upload a glasses image
3. Click "Find 3D Model"
4. Should see matching result with 3D viewer

### Test 3: Full Integration
```bash
# From frontend directory
npm run build
npm run preview
# Test the production build locally
```

---

## 🐛 Troubleshooting

### "Cannot GET /" in Browser
**This is normal!** The backend is an API, not a website.
- ✅ API endpoints work fine
- ✅ Frontend can connect
- ⚠️ Just don't visit the URL directly in browser

If you want a nice homepage message, the routes are already added - just deploy them!

### CORS Errors
If you see CORS errors in browser console:
```javascript
// Backend already has CORS enabled:
app.use(cors()); // ✅ Already in server.mjs
```

### 404 Errors
If `/match-model` returns 404:
- Check the URL is correct
- Verify it's a POST request (not GET)
- Check browser network tab for details

### Slow Response
First request after 15 min takes 30-60s (cold start on free tier).
Solutions:
- Use keep-alive script: `node backend/keep-alive.mjs --loop`
- Enable GitHub Actions (already configured)
- Upgrade to paid plan ($7/month)

---

## ✅ Verification Checklist

- [x] Frontend API URLs updated to production
- [x] Backend homepage routes added
- [ ] Backend changes deployed to Render
- [ ] Frontend deployed to Vercel/Netlify
- [ ] End-to-end test completed
- [ ] Monitoring enabled

---

## 📝 Summary

**What's Working:**
- ✅ Backend API is live and operational
- ✅ 167 models available
- ✅ Frontend code is production-ready
- ✅ All API URLs configured correctly

**What's Pending:**
- ⏳ Deploy backend homepage routes (optional)
- ⏳ Deploy frontend to production
- ⏳ Enable monitoring

**Time to Production:**
- Deploy backend: 2 minutes (auto-deploy)
- Deploy frontend: 5 minutes (Vercel)
- Total: ~7 minutes

---

## 🎉 You're Almost There!

Your app is 95% ready. Just deploy and test!

```bash
# 1. Deploy backend changes (optional)
git add .
git commit -m "Production ready"
git push origin main

# 2. Deploy frontend
cd frontend
vercel deploy

# 3. Test it!
# Visit your Vercel URL and upload images
```

**That's it! Your AI Glasses Finder will be live! 🚀**
