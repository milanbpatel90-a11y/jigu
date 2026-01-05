# Professional AI Glasses Finder Dashboard

A professional, production-ready dashboard for finding matching 3D glasses models using AI-powered image recognition.

## Features

### 🎯 Core Functionality
- **Multi-Image Upload**: Upload 1-4 images from different angles
- **AI-Powered Matching**: Uses OpenAI's CLIP model for accurate matching
- **3D Model Viewer**: Interactive 3D visualization with rotation, zoom, and pan
- **Real-time Results**: Instant matching with confidence scores

### 💎 Professional Design
- Modern, clean interface with gradient backgrounds
- Smooth animations and transitions
- Responsive design (mobile, tablet, desktop)
- Intuitive drag-and-drop file upload
- Professional loading states and error handling

### 🚀 Performance
- Optimized 3D rendering with Three.js
- Efficient image processing
- Fast API responses
- Proper memory management

## User Workflow

1. **Upload Images**
   - Click the upload area or drag & drop
   - Select 1-4 images of glasses from different angles
   - Preview images before matching

2. **Find Match**
   - Click "Find 3D Model" button
   - AI analyzes images and finds best match
   - View confidence score (percentage)

3. **View 3D Model**
   - Interactive 3D viewer loads automatically
   - Rotate: Left-click and drag
   - Zoom: Mouse wheel
   - Pan: Right-click and drag

## Technical Stack

### Frontend
- **React 18**: Modern UI framework
- **Three.js**: 3D rendering engine
- **Vite**: Fast build tool
- **CSS3**: Professional styling with gradients and animations

### Backend
- **Node.js + Express**: API server
- **Python**: AI matching engine
- **CLIP (OpenAI)**: Vision model for image matching
- **PyTorch**: Deep learning framework
- **Wasabi S3**: Cloud storage for 3D models

## API Integration

The dashboard uses 4 main API endpoints:

```javascript
// Get all models
GET /models

// Upload new model
POST /upload-model

// Find matching model
POST /match-model

// Rebuild AI embeddings
POST /rebuild-embeddings
```

See `API_DOCUMENTATION.md` for complete API reference.

## Installation & Setup

### Prerequisites
```bash
# Node.js 16+
node --version

# Python 3.10+
python --version
```

### Backend Setup
```bash
cd backend

# Install Node dependencies
npm install

# Install Python dependencies
pip install torch transformers pillow boto3

# Generate reference images
python generate_all_references.py

# Build AI embeddings
python match.py --build

# Start server
node server.mjs
```

### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Access Dashboard
Open http://localhost:5173/ in your browser

## Configuration

### S3/Wasabi Storage
Edit `backend/server.mjs`:
```javascript
const s3 = new AWS.S3({
  endpoint: "your-endpoint",
  region: "your-region",
  accessKeyId: "your-key",
  secretAccessKey: "your-secret"
});
```

### API URL
Edit `frontend/src/App.jsx` and `frontend/src/Viewer.jsx`:
```javascript
const API = "http://your-api-url:5000";
```

## Improving Match Accuracy

For 100% accurate matching, you need high-quality reference images:

### Option 1: Use Render Tool
1. Open http://localhost:5173/render-tool.html
2. Click "Start Rendering All Models"
3. Download all rendered images
4. Upload each GLB with its rendered image as thumbnail
5. Click "Rebuild embeddings"

### Option 2: Manual Upload
1. For each GLB model, create/find a clear photo
2. Upload via dashboard with thumbnail
3. Rebuild embeddings

### Option 3: Use Original Thumbnails
If models came from Sketchfab or similar:
1. Download original preview images
2. Match filenames to GLB files
3. Upload via API or dashboard

## Production Deployment

### Frontend (Vercel/Netlify)
```bash
cd frontend
npm run build
# Deploy dist/ folder
```

### Backend (Heroku/AWS/DigitalOcean)
```bash
cd backend
# Set environment variables
# Deploy with Node.js + Python runtime
```

### Environment Variables
```bash
PORT=5000
S3_ENDPOINT=your-endpoint
S3_REGION=your-region
S3_ACCESS_KEY=your-key
S3_SECRET_KEY=your-secret
S3_BUCKET=your-bucket
```

## Performance Optimization

### For Production:
1. **Enable caching**: Add Redis for model list caching
2. **CDN**: Serve 3D models via CDN
3. **Image optimization**: Compress uploaded images
4. **Rate limiting**: Add API rate limits
5. **Authentication**: Add user authentication
6. **Monitoring**: Add error tracking (Sentry)
7. **Analytics**: Track usage patterns

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires WebGL support for 3D rendering.

## Troubleshooting

### Models not loading
- Check CORS configuration on S3
- Verify signed URLs are valid
- Check browser console for errors

### AI matching not working
- Ensure reference images exist
- Rebuild embeddings: `python match.py --build`
- Check Python dependencies installed

### Poor match accuracy
- Upload more images (3-4 recommended)
- Use clear, well-lit photos
- Ensure reference images are high quality
- Try different angles

## License

Proprietary - All rights reserved

## Support

For issues or questions, check:
1. Browser console (F12)
2. Backend terminal logs
3. API documentation
4. This README
