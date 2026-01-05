# AI Matching Setup Guide

## Problem
The AI matching feature is not working because there are no reference images.

## How It Works
1. For each GLB model (e.g., `cat_eye_glasses.glb`), you need a corresponding reference image (e.g., `cat_eye_glasses.jpg`)
2. The reference images should be photos/renders of the glasses from a clear angle
3. The AI uses CLIP (OpenAI's vision model) to match user-uploaded photos to these reference images
4. When a match is found, it returns the corresponding GLB model

## Setup Steps

### Option 1: Upload via the UI (Recommended)
1. Go to http://localhost:5173/
2. In the left sidebar, find "Upload GLB"
3. Select your GLB file
4. **Important**: Also select a thumbnail image (this becomes the reference image)
5. Click upload
6. After uploading all models with thumbnails, click "Rebuild embeddings"

### Option 2: Manual Setup
1. Place reference images in `backend/reference_images/`
2. Name them to match your GLB files (e.g., `model.jpg` for `model.glb`)
3. Run: `python match.py --build` to build embeddings

## Testing
1. Upload 1-5 photos of glasses using the "Find nearest 3D model" feature
2. The AI will match them to the closest reference image
3. The corresponding 3D model will be displayed

## Current Status
- ✅ Python dependencies installed
- ✅ reference_images folder created
- ❌ No reference images uploaded yet
- ❌ Embeddings not built

## Next Steps
Upload your GLB models with thumbnail images through the UI!
