# ✅ Dashboard Deployment Checklist

## Pre-Deployment Checks

### 1. Verify Your Files
- [ ] `frontend/` folder exists with React dashboard
- [ ] `backend/` folder exists with server.mjs
- [ ] `backend/.env` has all required variables
- [ ] Code is pushed to GitHub

### 2. Check Environment Variables
Open `backend/.env` and verify you have:
- [ ] `AWS_ACCESS_KEY_ID` (Wasabi key)
- [ ] `AWS_SECRET_ACCESS_KEY` (Wasabi secret)
- [ ] `AWS_ENDPOINT` (e.g., s3.eu-west-1.wasabisys.com)
- [ ] `S3_BUCKET` (your bucket name)
- [ ] `AWS_REGION` (e.g., eu-west-1)

---

## Deployment Steps

### Step 1: Deploy Backend to Render (10 min)

1. **Go to Render**
   - [ ] Visit https://dashboard.render.com/
   - [ ] Sign in or create account

2. **Create New Web Service**
   - [ ] Click "New +" → "Web Service"
   - [ ] Connect your GitHub repository
   - [ ] Click "Connect"

3. **Configure Service**
   - [ ] **Name:** `ai-glasses-backend`
   - [ ] **Region:** Choose closest to you
   - [ ] **Branch:** `main`
   - [ ] **Root Directory:** `backend`
   - [ ] **Runtime:** `Node`
   - [ ] **Build Command:** `npm install && pip install -r requirements.txt`
   - [ ] **Start Command:** `node server.mjs`
   - [ ] **Instance Type:** `Free`

4. **Add Environment Variables**
   Click "Advanced" → "Add Environment Variable" for each:
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
   - [ ] All variables added

5. **Deploy**
   - [ ] Click "Create Web Service"
   - [ ] Wait 3-5 minutes for deployment
   - [ ] Copy your backend URL (e.g., `https://ai-glasses-backend-xyz.onrender.com`)
   - [ ] Test: `curl https://your-backend-url.onrender.com/models`

---

### Step 2: Update Frontend Configuration (2 min)

1. **Update API URL**
   - [ ] Open `frontend/.env.production`
   - [ ] Replace with your actual Render URL:
   ```
   VITE_API_URL=https://your-actual-backend-url.onrender.com
   ```
   - [ ] Save the file
   - [ ] Commit and push to GitHub (optional, for tracking)

---

### Step 3: Deploy Dashboard to Vercel (5 min)

1. **Install Vercel CLI** (if not installed)
   ```cmd
   npm install -g vercel
   ```
   - [ ] Vercel CLI installed

2. **Navigate to Frontend**
   ```cmd
   cd frontend
   ```
   - [ ] In frontend directory

3. **Deploy to Vercel**
   ```cmd
   vercel
   ```
   
   Answer the prompts:
   - [ ] Set up and deploy? → **Y**
   - [ ] Which scope? → Choose your account
   - [ ] Link to existing project? → **N**
   - [ ] Project name? → `ai-glasses-dashboard`
   - [ ] Directory? → `./`
   - [ ] Override settings? → **N**

4. **Deploy to Production**
   ```cmd
   vercel --prod
   ```
   - [ ] Production deployment complete
   - [ ] Copy your dashboard URL (e.g., `https://ai-glasses-dashboard.vercel.app`)

---

## Post-Deployment Testing

### Test Backend (2 min)

1. **Test Models Endpoint**
   ```cmd
   curl https://your-backend-url.onrender.com/models
   ```
   - [ ] Returns JSON array of models
   - [ ] No errors in response

2. **Test Health Endpoint**
   ```cmd
   curl https://your-backend-url.onrender.com/
   ```
   - [ ] Returns `{"status":"ok","service":"AI Glasses Backend"}`

### Test Dashboard (3 min)

1. **Open Dashboard**
   - [ ] Visit your Vercel URL in browser
   - [ ] Dashboard loads without errors
   - [ ] No console errors (F12 → Console)

2. **Test Finder Tab**
   - [ ] Upload 1-4 glasses images
   - [ ] Click "Find 3D Model"
   - [ ] AI matching works (may take 30-60s on first request - cold start)
   - [ ] 3D model displays in viewer
   - [ ] Can rotate/zoom model

3. **Test Save Feature**
   - [ ] Click "Save to Dashboard"
   - [ ] Model appears in Dashboard tab
   - [ ] Dashboard count updates (e.g., "Dashboard (1)")

4. **Test Dashboard Tab**
   - [ ] Switch to Dashboard tab
   - [ ] Saved models display
   - [ ] Can click "Try On" button
   - [ ] Can delete models

---

## Troubleshooting

### Backend Issues

**Problem:** Backend returns 500 error
- [ ] Check Render logs (Dashboard → Service → Logs)
- [ ] Verify environment variables are set correctly
- [ ] Check if Python dependencies installed

**Problem:** Models endpoint returns empty array
- [ ] Verify S3 credentials in environment variables
- [ ] Check S3 bucket name is correct
- [ ] Test S3 access: `python backend/test_s3_access.py` (locally)

**Problem:** Cold start takes too long
- [ ] Normal for free tier (30-60 seconds)
- [ ] Consider upgrading to Render Starter ($7/month)
- [ ] Or set up keep-alive monitoring

### Dashboard Issues

**Problem:** Dashboard shows "Failed to fetch models"
- [ ] Check if backend URL in `.env.production` is correct
- [ ] Verify backend is running (test with curl)
- [ ] Check browser console for CORS errors

**Problem:** AI matching fails
- [ ] Check backend logs for Python errors
- [ ] Verify images are valid (PNG, JPG, WEBP)
- [ ] Try with different images

**Problem:** 3D models don't load
- [ ] Check browser console for errors
- [ ] Verify S3 signed URLs are valid
- [ ] Check if CORS is enabled on backend

---

## Success Criteria

### ✅ Deployment Complete When:
- [ ] Backend is live and responding
- [ ] Dashboard loads in browser
- [ ] Can upload images and get AI matches
- [ ] 3D models display correctly
- [ ] Can save models to dashboard
- [ ] Dashboard tab shows saved models
- [ ] Try-on feature works

---

## Your Deployment URLs

**Backend API:**
```
https://_____________________________.onrender.com
```

**Dashboard:**
```
https://_____________________________.vercel.app
```

---

## Next Steps (Optional)

### Enable Monitoring
- [ ] Set up UptimeRobot (https://uptimerobot.com/)
- [ ] Monitor backend URL every 5 minutes
- [ ] Prevents cold starts

### Custom Domain
- [ ] Add custom domain in Vercel settings
- [ ] Add custom domain in Render settings
- [ ] Update DNS records

### Upgrade Plans (When Ready)
- [ ] Render Starter: $7/month (no cold starts)
- [ ] Vercel Pro: $20/month (better performance)

---

## Support

### Documentation
- `DEPLOY_NOW.md` - Detailed deployment guide
- `WHAT_TO_DEPLOY.md` - What's being deployed
- `API_DOCUMENTATION.md` - API reference

### Quick Commands
```cmd
# Redeploy dashboard
cd frontend
vercel --prod

# Check backend status
curl https://your-backend-url.onrender.com/

# View Vercel logs
vercel logs

# View Render logs
# Go to: https://dashboard.render.com/ → Your Service → Logs
```

---

**Deployment Date:** _______________

**Status:** 
- [ ] Backend Deployed
- [ ] Dashboard Deployed
- [ ] Tested & Working

**Notes:**
_______________________________________
_______________________________________
_______________________________________
