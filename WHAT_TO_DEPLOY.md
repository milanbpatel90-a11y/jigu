# 📦 What's Being Deployed

## Your Project Structure

```
your-project/
├── frontend/              ← DASHBOARD (Deploy this!)
│   ├── src/
│   │   ├── App.jsx       ← Finder + Dashboard tabs
│   │   └── tryon/        ← Try-on component (used in dashboard)
│   └── index.html
│
├── backend/              ← API SERVER (Deploy this!)
│   └── server.mjs
│
├── index.html            ← TRY-ON APP (NOT deploying)
├── script.js             ← Face tracking app
└── style.css
```

## What You're Deploying

### ✅ Dashboard (frontend folder)
- **Location:** `frontend/`
- **What it is:** AI Glasses Finder + Saved Models Dashboard
- **Features:**
  - Upload glasses images
  - AI matching to find best 3D model
  - Save models to dashboard
  - View saved models
  - Try-on view integrated in dashboard
- **Deploy to:** Vercel
- **URL example:** `https://ai-glasses-dashboard.vercel.app`

### ✅ Backend API (backend folder)
- **Location:** `backend/`
- **What it is:** Express server with AI matching
- **Features:**
  - List 3D models from S3
  - AI matching using CLIP
  - Upload new models
  - Saved models API
- **Deploy to:** Render
- **URL example:** `https://ai-glasses-backend.onrender.com`

### ❌ Try-On App (root folder) - NOT DEPLOYING
- **Location:** Root folder (`index.html`, `script.js`)
- **What it is:** Standalone face tracking try-on
- **Why not deploying:** You want the dashboard, not this standalone version
- **Note:** The dashboard includes try-on functionality already

## Quick Deploy Commands

```bash
# 1. Deploy Backend to Render
# Go to https://dashboard.render.com/
# Connect GitHub repo, set root directory to "backend"

# 2. Deploy Dashboard to Vercel
cd frontend
vercel --prod
```

## After Deployment

You'll have:
- **Dashboard URL:** Where users upload images and find glasses
- **Backend API:** Powers the AI matching
- **Try-On:** Integrated in the dashboard (not separate)

## Visual Guide

**Dashboard Interface:**
```
┌─────────────────────────────────────┐
│  Finder  |  Dashboard (0)           │
├─────────────────────────────────────┤
│                                     │
│  Upload Glasses Images              │
│  ┌─────────────────────────────┐   │
│  │  Click to upload or drag    │   │
│  │  PNG, JPG, WEBP (max 4)     │   │
│  └─────────────────────────────┘   │
│                                     │
│  [🔍 Find 3D Model]                 │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  3D Model Preview           │   │
│  │  (Three.js viewer)          │   │
│  └─────────────────────────────┘   │
│                                     │
│  [💾 Save to Dashboard]             │
│                                     │
└─────────────────────────────────────┘
```

This is what gets deployed!
