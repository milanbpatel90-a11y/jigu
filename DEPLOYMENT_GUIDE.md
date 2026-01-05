# Deployment Guide - AI Glasses Backend

## 🚀 Current Deployment Status

**Backend URL:** https://ai-glasses-backend.onrender.com/

**Status:** ✅ Live and operational

**Platform:** Render (Free Tier)

---

## 📊 Backend Configuration

### Server Details
- **Runtime:** Node.js + Python
- **Port:** 5000
- **Region:** Oregon (US West)
- **Auto-deploy:** Enabled from main branch

### Environment Variables
```bash
PORT=5000
REQUIRE_AUTH=false
NODE_ENV=production
```

### Health Check
- **Endpoint:** `/models`
- **Expected Response:** 200 OK with JSON array of models

---

## 🔧 Deployment Configuration

### Render Settings (render.yaml)
```yaml
services:
  - type: web
    name: ai-glasses-backend
    runtime: node
    buildCommand: cd backend && npm install && pip install -r requirements.txt
    startCommand: cd backend && node server.mjs
    healthCheckPath: /models
```

### Build Process
1. Install Node.js dependencies (`npm install`)
2. Install Python dependencies (`pip install -r requirements.txt`)
3. Start Express server (`node server.mjs`)

---

## 🌐 API Endpoints (Production)

Base URL: `https://ai-glasses-backend.onrender.com`

### Available Endpoints
- `GET /models` - List all 3D models (167 models)
- `POST /match-model` - AI matching (upload images)
- `POST /upload-model` - Upload new models
- `POST /rebuild-embeddings` - Rebuild AI index

### Test the API
```bash
# List models
curl https://ai-glasses-backend.onrender.com/models

# Match images
curl -X POST https://ai-glasses-backend.onrender.com/match-model \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg"
```

---

## ⚠️ Important Notes

### Free Tier Limitations
- **Spin Down:** Service sleeps after 15 minutes of inactivity
- **Wake Up Time:** 30-60 seconds on first request
- **Monthly Hours:** 750 hours/month (sufficient for most use)
- **Bandwidth:** Limited to 100GB/month

### Handling Cold Starts
The first request after inactivity will be slow. Solutions:
1. **Keep-alive ping:** Set up a cron job to ping every 10 minutes
2. **User feedback:** Show "Waking up server..." message
3. **Upgrade:** Move to paid plan for always-on service

### Storage
- Models stored in Wasabi S3 (not on Render)
- Persistent across deployments
- No data loss on redeploy

---

## 🔐 Security Configuration

### Current Setup
- **Authentication:** Disabled (REQUIRE_AUTH=false)
- **CORS:** Enabled for all origins
- **API Keys:** Available but not enforced

### Enable Authentication
```bash
# In Render dashboard, add environment variable:
REQUIRE_AUTH=true

# Then use API keys in requests:
curl https://ai-glasses-backend.onrender.com/models \
  -H "X-API-Key: your-api-key" \
  -H "X-Secret-Key: your-secret-key"
```

---

## 📈 Monitoring & Logs

### View Logs
1. Go to Render Dashboard
2. Select "ai-glasses-backend" service
3. Click "Logs" tab
4. Real-time logs available

### Key Metrics to Monitor
- Response times
- Error rates
- Memory usage
- Request counts

### Health Check
```bash
# Check if service is healthy
curl -I https://ai-glasses-backend.onrender.com/models
# Should return: HTTP/1.1 200 OK
```

---

## 🔄 Deployment Process

### Automatic Deployment
1. Push code to GitHub main branch
2. Render automatically detects changes
3. Builds and deploys new version
4. Zero-downtime deployment

### Manual Deployment
1. Go to Render Dashboard
2. Select service
3. Click "Manual Deploy"
4. Choose branch to deploy

### Rollback
1. Go to Render Dashboard
2. Select service
3. Click "Rollback" to previous version

---

## 🚀 Frontend Deployment Options

### Option 1: Vercel (Recommended)
```bash
cd frontend
npm install -g vercel
vercel

# Update API URL in src/App.jsx:
const API = "https://ai-glasses-backend.onrender.com";
```

### Option 2: Netlify
```bash
cd frontend
npm run build

# Deploy dist/ folder to Netlify
# Update API URL before building
```

### Option 3: GitHub Pages
```bash
cd frontend
npm run build

# Deploy dist/ folder to gh-pages branch
```

---

## 🔧 Troubleshooting

### Service Not Responding
1. Check Render dashboard for errors
2. View logs for error messages
3. Verify environment variables
4. Check if service is sleeping (cold start)

### AI Matching Fails
1. Ensure Python dependencies installed
2. Check if reference_embeddings.pt exists
3. Verify S3 credentials are correct
4. Check logs for Python errors

### Models Not Loading
1. Verify S3 bucket access
2. Check CORS configuration
3. Ensure signed URLs are valid
4. Test S3 connection: `python backend/test_s3_access.py`

### Slow Performance
1. Free tier has limited resources
2. Consider upgrading to paid plan
3. Optimize image sizes
4. Reduce number of models if possible

---

## 💰 Upgrade Options

### Render Plans
- **Free:** $0/month (current)
  - 750 hours/month
  - Spins down after inactivity
  - 512MB RAM

- **Starter:** $7/month
  - Always on
  - 512MB RAM
  - Better performance

- **Standard:** $25/month
  - 2GB RAM
  - Faster CPU
  - Production ready

### When to Upgrade
- High traffic expected
- Need always-on service
- Require faster response times
- Running out of free hours

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] Test locally
- [ ] Update API URLs
- [ ] Configure environment variables
- [ ] Test S3 connection
- [ ] Verify Python dependencies

### Post-Deployment
- [ ] Test all endpoints
- [ ] Verify AI matching works
- [ ] Check logs for errors
- [ ] Test webhook integration
- [ ] Monitor performance

### Production Readiness
- [ ] Enable authentication
- [ ] Set up monitoring
- [ ] Configure rate limiting
- [ ] Add error tracking (Sentry)
- [ ] Set up backup strategy
- [ ] Document API for users

---

## 🔗 Useful Links

- **Backend URL:** https://ai-glasses-backend.onrender.com/
- **Render Dashboard:** https://dashboard.render.com/
- **API Documentation:** See API_DOCUMENTATION.md
- **Webhook Guide:** See WEBHOOK_INTEGRATION_GUIDE.md

---

## 🆘 Support

### Common Issues
1. **Cold start delays:** Normal for free tier
2. **Python errors:** Check requirements.txt
3. **S3 access denied:** Verify credentials
4. **CORS errors:** Check frontend API URL

### Getting Help
1. Check Render logs
2. Review documentation
3. Test with curl commands
4. Verify environment variables

---

**Deployment Status:** ✅ Production Ready

Last Updated: December 2025
