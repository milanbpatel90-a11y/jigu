# AI Vision Matching Setup Guide

This guide explains how to set up the AI-powered glasses matching system using GPT-4 Vision.

## Overview

The AI Glasses Finder now uses **GPT-4 Vision** to analyze uploaded glasses images and find the most visually similar 3D model. This provides much more accurate matching based on:

- **Shape**: Round, rectangular, aviator, cat-eye, etc.
- **Frame Color**: Exact color detection from the image
- **Material**: Metal, plastic, acetate, titanium
- **Style**: Vintage, modern, sporty, luxury, etc.
- **Lens Type**: Clear, tinted, gradient, mirrored

## Prerequisites

1. **Python 3.8+** installed
2. **OpenAI API Key** with GPT-4 Vision access
3. **Node.js 16+** for the backend server

## Installation

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `openai>=1.0.0` - GPT-4 Vision API client
- `pillow` - Image processing
- `numpy` - Color analysis
- `torch` & `transformers` - Fallback CLIP matching

### 2. Configure OpenAI API Key

Add your OpenAI API key to the `.env` file:

```env
# OpenAI Configuration for GPT-4 Vision
OPENAI_API_KEY=sk-your-openai-api-key-here

# Wasabi S3 Configuration (existing)
AWS_ACCESS_KEY_ID=your_wasabi_access_key
AWS_SECRET_ACCESS_KEY=your_wasabi_secret_key
AWS_ENDPOINT=s3.eu-west-1.wasabisys.com
AWS_REGION=eu-west-1
S3_BUCKET=jigu
```

### 3. Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create new secret key**
5. Copy the key and add it to your `.env` file

> **Note**: GPT-4 Vision requires a paid OpenAI account. Pricing is approximately $0.01-0.03 per image analysis.

## How It Works

### Matching Flow

```
┌─────────────────────────────────────────────────────────────┐
│                 AI Vision Matching Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. USER UPLOADS IMAGES (1-4 angles)                        │
│           ↓                                                  │
│  2. GPT-4 VISION ANALYSIS                                   │
│     - Analyzes shape, color, material, style                │
│     - Extracts exact hex colors                             │
│     - Identifies distinctive features                       │
│           ↓                                                  │
│  3. FEATURE COMPARISON                                      │
│     - Compares against reference image features             │
│     - Calculates similarity scores                          │
│           ↓                                                  │
│  4. BEST MATCH SELECTION                                    │
│     - Selects model with highest similarity                 │
│     - Applies detected colors to 3D model                   │
│           ↓                                                  │
│  5. 3D MODEL CUSTOMIZATION                                  │
│     - Frame color applied                                   │
│     - Lens tint and color applied                           │
│     - Material properties set                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Files

- `vision_matcher.py` - Main AI matching engine with GPT-4 Vision
- `match.py` - Legacy CLIP-based matching (fallback)
- `model_features_cache.json` - Cached features for reference images
- `vision_analysis_cache.json` - Cached GPT-4 Vision results

## Usage

### Basic Matching

When users upload glasses images through the dashboard, the system automatically:

1. Sends images to GPT-4 Vision for analysis
2. Extracts visual features (shape, color, material, style)
3. Compares against available 3D models
4. Returns the best matching model with customization parameters

### Pre-analyze Reference Images (Recommended)

To improve matching speed and accuracy, pre-analyze your reference images:

```bash
cd backend
python vision_matcher.py --build
```

This creates a features cache for all reference images in `reference_images/` folder.

### Manual Testing

Test the matcher directly:

```bash
python vision_matcher.py path/to/glasses_image.jpg
```

Output:
```json
{
  "best_model": "ray_ban_glasses.glb",
  "confidence": 0.85,
  "detected_shape": "aviator",
  "detected_style": "classic",
  "frameColor": "#1a1a1a",
  "lensColor": "#3b82f6",
  "tintOpacity": 0.5,
  "frameMaterial": "metal"
}
```

## Fallback Behavior

If GPT-4 Vision is not available (no API key or network issues), the system falls back to:

1. **Shape-based matching** using image analysis
2. **Color extraction** using PIL/numpy
3. **Name-based inference** from model filenames

## Adding New 3D Models

For best matching results when adding new models:

1. **Upload the .glb file** to Wasabi S3 bucket
2. **Create a reference image** (PNG/JPG) showing the glasses
3. **Name the reference image** same as the model (e.g., `ray_ban_aviator.jpg` for `ray_ban_aviator.glb`)
4. **Upload reference image** to `reference_images/` folder in S3
5. **Rebuild the cache**: `python vision_matcher.py --build`

### Recommended Reference Image Guidelines

- Clear, front-facing view of the glasses
- White or neutral background
- Good lighting, no shadows on lenses
- Resolution: 512x512 or higher
- Format: PNG or JPG

## API Response Format

The `/match-model` endpoint returns:

```json
{
  "best_model": "model_name.glb",
  "model_url": "https://..../proxy-model/model_name.glb",
  "confidence": 0.85,
  "matched": true,
  "method": "vision_features",
  "detected_shape": "aviator",
  "detected_style": "classic",
  "detected_material": "metal",
  "detected_features": {
    "shape": "aviator",
    "frame_color_hex": "#1a1a1a",
    "frame_color_name": "black",
    "lens_color_hex": "#4a5568",
    "lens_type": "tinted",
    "material": "metal",
    "style": "classic",
    "size": "medium"
  },
  "frameColor": "#1a1a1a",
  "lensColor": "#4a5568",
  "tintOpacity": 0.5,
  "frameMaterial": "metal",
  "frameMetalness": 0.7
}
```

## Troubleshooting

### "OpenAI not installed" Error
```bash
pip install openai>=1.0.0
```

### "No OpenAI API key found" Error
Ensure `OPENAI_API_KEY` is set in your `.env` file.

### Low Match Confidence
- Ensure reference images exist for your 3D models
- Run `python vision_matcher.py --build` to update the cache
- Upload clearer glasses images

### Rate Limiting
GPT-4 Vision has rate limits. If you hit them:
- Results are cached automatically
- Wait a few minutes and retry
- Consider upgrading your OpenAI plan

## Cost Estimation

GPT-4 Vision pricing (approximate):
- ~$0.01-0.03 per image analysis
- Cached results are free (no API call)
- Pre-building cache reduces runtime costs

For a typical session:
- 4 uploaded images = ~$0.08-0.12
- With caching, subsequent similar uploads are free

## Security Notes

- Never commit your `.env` file with API keys
- Use environment variables in production
- Consider rate limiting the `/match-model` endpoint
- API keys should have minimal required permissions

## Support

If you encounter issues:
1. Check the server logs for Python output
2. Verify API key is valid at [OpenAI Platform](https://platform.openai.com/)
3. Test with `python vision_matcher.py --help`
4. Ensure all dependencies are installed: `pip install -r requirements.txt`
