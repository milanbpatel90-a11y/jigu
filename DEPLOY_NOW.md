# 🚀 Quick Deploy Guide - Dashboard Only

## Deploy Your AI Glasses Dashboard Online (15 minutes)

This guide deploys the **Dashboard** (AI Finder + Saved Models), not the Try-On app.

### Prerequisites
- GitHub account
- Vercel account (free) - https://vercel.com
- Render account (free) - https://render.com

---

## Step 1: Deploy Backend to Render (5 min)

1. **Push your code to GitHub** (if not already)
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com/
   - Click "New +" → "Web Service"

3. **Connect your GitHub repository**
   - Select your repository
   - Click "Connect"

4. **Configure the service:**
   - **Name:** `ai-glasses-backend`
   - **Region:** Choose closest to you
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && pip install -r requirements.txt`
   - **Start Command:** `node server.mjs`
   - **Instance Type:** `Free`

5. **Add Environment Variables:**
   Click "Advanced" → "Add Environment Variable"
   
   Required variables (from your backend/.env):
   ```
   PORT=5000
   AWS_ACCESS_KEY_ID=your_wasabi_key
   AWS_SECRET_ACCESS_KEY=your_wasabi_secret
   AWS_ENDPOINT=s3.eu-west-1.wasabisys.com
   AWS_REGION=eu-west-1
   S3_BUCKET=jigu
   REQUIRE_AUTH=false
   NODE_ENV=production
   ```

6. **Click "Create Web Service"**
   - Wait 3-5 minutes for deployment
   - Copy your backend URL (e.g., `https://ai-glasses-backend.onrender.com`)

---

## Step 2: Deploy Dashboard to Vercel (5 min)

1. **Update API URL in frontend**
   
   Edit `frontend/.env.production` (already created):
   ```bash
   VITE_API_URL=https://your-backend-url.onrender.com
   ```
   
   Replace `your-backend-url` with your actual Render URL from Step 1.

2. **Install Vercel CLI** (if not installed)
   ```bash
   npm install -g vercel
   ```

3. **Deploy Dashboard to Vercel**
   ```bash
   cd frontend
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? Choose your account
   - Link to existing project? **N**
   - Project name? `ai-glasses-dashboard` (or your choice)
   - Directory? `./` (current directory)
   - Override settings? **N**

4. **Deploy to production**
   ```bash
   vercel --prod
   ```

5. **Your Dashboard is live!** 🎉
   - Vercel will give you a URL like: `https://ai-glasses-dashboard.vercel.app`
   - This is the Finder + Dashboard interface (NOT the try-on app)

---

## Step 3: Test Your Deployment (2 min)

1. **Test Backend:**
   ```bash
   curl https://your-backend-url.onrender.com/models
   ```
   Should return a JSON array of models.

2. **Test Frontend:**
   - Open your Vercel URL in browser
   - Try uploading glasses images
   - Check if AI matching works

---

## Alternative: Deploy Dashboard to Railway

If you prefer a single platform:

1. **Go to Railway:** https://railway.app/
2. **New Project** → **Deploy from GitHub repo**
3. **Add two services:**
   - **Backend:** Root directory = `backend`, Start command = `node server.mjs`
   - **Dashboard:** Root directory = `frontend`, Build command = `npm run build`
4. **Add environment variables** to backend service
5. **Update frontend env** with Railway backend URL

Note: This deploys the Dashboard (frontend folder), not the Try-On app (root folder)

---

## Troubleshooting

### Backend Issues
- **Cold starts:** Free tier sleeps after 15 min. First request takes 30-60s
- **S3 errors:** Check your Wasabi credentials in environment variables
- **Python errors:** Ensure requirements.txt is in backend folder

### Frontend Issues
- **API errors:** Verify VITE_API_URL is correct
- **CORS errors:** Backend has CORS enabled, check browser console
- **Build fails:** Run `npm install` in frontend folder first

### Common Fixes
```bash
# Rebuild frontend with new API URL
cd frontend
npm run build
vercel --prod

# Check backend logs
# Go to Render dashboard → Your service → Logs

# Test API directly
curl https://your-backend-url.onrender.com/
```

---

## What's Next?

### Enable Monitoring (Optional)
Keep your backend alive with UptimeRobot:
1. Sign up at https://uptimerobot.com/
2. Add monitor for your backend URL
3. Set interval to 5 minutes

### Custom Domain (Optional)
- **Vercel:** Settings → Domains → Add your domain
- **Render:** Settings → Custom Domain → Add your domain

### Upgrade Plans (When Ready)
- **Render Starter:** $7/month (no cold starts)
- **Vercel Pro:** $20/month (better performance)

---

## Quick Commands Reference

```bash
# Deploy frontend updates
cd frontend
vercel --prod

# Check backend status
curl https://your-backend-url.onrender.com/

# View frontend logs
vercel logs

# Redeploy backend
# Push to GitHub, Render auto-deploys

# Local testing
cd backend && node server.mjs
cd frontend && npm run dev
```

---

## 🎉 You're Live!

Your AI Glasses Dashboard is now deployed and accessible worldwide!

**Share your URLs:**
- Dashboard: `https://your-dashboard.vercel.app`
- Backend API: `https://your-backend.onrender.com`

**What's deployed:**
- ✅ Dashboard (AI Finder + Saved Models)
- ✅ Backend API
- ❌ Try-On app (not deployed - that's in root folder)

**Estimated costs:** $0/month (both free tiers)

---

Need help? Check:
- DEPLOYMENT_GUIDE.md (detailed guide)
- API_DOCUMENTATION.md (API reference)
- Backend logs on Render dashboard
- Frontend logs with `vercel logs`
