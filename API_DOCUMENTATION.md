# 3D AI Glasses Dashboard - API Documentation

Base URL: `http://localhost:5000`

## Endpoints

### 1. Get All Models
Retrieve a list of all available 3D glasses models.

**Endpoint:** `GET /models`

**Response:**
```json
[
  {
    "name": "cat_eye_glasses.glb",
    "url": "https://jigu.s3.eu-west-1.wasabisys.com/cat_eye_glasses.glb?X-Amz-Algorithm=..."
  },
  {
    "name": "ray_ban_glasses.glb",
    "url": "https://jigu.s3.eu-west-1.wasabisys.com/ray_ban_glasses.glb?X-Amz-Algorithm=..."
  }
]
```

**Example:**
```bash
curl http://localhost:5000/models
```

---

### 2. Upload 3D Model
Upload a new GLB model with optional thumbnail image.

**Endpoint:** `POST /upload-model`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (required): GLB file
- `thumb` (optional): Thumbnail image (JPG, PNG, etc.)

**Response:**
```json
{
  "ok": true,
  "name": "new_glasses.glb"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/upload-model \
  -F "file=@glasses.glb" \
  -F "thumb=@glasses_thumb.jpg"
```

**Error Response:**
```json
{
  "error": "No GLB file uploaded (field 'file')"
}
```

---

### 3. AI Model Matching
Upload 1-5 images of glasses to find the nearest matching 3D model.

**Endpoint:** `POST /match-model`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `images` (required): 1-5 image files (JPG, PNG, etc.)

**Response:**
```json
{
  "best_model": "ray_ban_glasses.glb",
  "confidence": 0.87,
  "source_image": "ray_ban_glasses.jpg"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/match-model \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg" \
  -F "images=@photo3.jpg"
```

**Error Response:**
```json
{
  "error": "No images uploaded"
}
```

---

### 4. Rebuild AI Embeddings
Rebuild the AI embeddings from reference images. Run this after uploading new models with thumbnails.

**Endpoint:** `POST /rebuild-embeddings`

**Response:**
```json
{
  "ok": true,
  "output": "{\"ok\": true, \"computed\": 167}"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/rebuild-embeddings
```

**Error Response:**
```json
{
  "error": "Rebuild failed",
  "details": "Python error message..."
}
```

---

## Integration Examples

### JavaScript/Fetch
```javascript
// Get all models
const models = await fetch('http://localhost:5000/models')
  .then(r => r.json());

// Upload model
const formData = new FormData();
formData.append('file', glbFile);
formData.append('thumb', thumbnailFile);

const result = await fetch('http://localhost:5000/upload-model', {
  method: 'POST',
  body: formData
}).then(r => r.json());

// Match images to model
const matchData = new FormData();
images.forEach(img => matchData.append('images', img));

const match = await fetch('http://localhost:5000/match-model', {
  method: 'POST',
  body: matchData
}).then(r => r.json());

console.log(`Best match: ${match.best_model} (${match.confidence * 100}%)`);
```

### Python
```python
import requests

# Get all models
response = requests.get('http://localhost:5000/models')
models = response.json()

# Upload model
files = {
    'file': open('glasses.glb', 'rb'),
    'thumb': open('thumb.jpg', 'rb')
}
response = requests.post('http://localhost:5000/upload-model', files=files)
print(response.json())

# Match images
files = {
    'images': [
        open('photo1.jpg', 'rb'),
        open('photo2.jpg', 'rb')
    ]
}
response = requests.post('http://localhost:5000/match-model', files=files)
match = response.json()
print(f"Best match: {match['best_model']} ({match['confidence']*100:.1f}%)")
```

### cURL
```bash
# Get all models
curl http://localhost:5000/models

# Upload model with thumbnail
curl -X POST http://localhost:5000/upload-model \
  -F "file=@my_glasses.glb" \
  -F "thumb=@my_glasses_thumb.jpg"

# Match images to find model
curl -X POST http://localhost:5000/match-model \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg" \
  -F "images=@photo3.jpg"

# Rebuild embeddings
curl -X POST http://localhost:5000/rebuild-embeddings
```

---

## CORS Configuration

The API supports CORS for all origins. Headers included:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: *`

---

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200 OK`: Success
- `400 Bad Request`: Invalid input (missing files, etc.)
- `500 Internal Server Error`: Server or AI processing error

Error responses include an `error` field with a description:
```json
{
  "error": "Description of what went wrong",
  "details": "Additional technical details (optional)"
}
```

---

## AI Matching Details

### How It Works
1. Upload 1-5 images of glasses
2. AI extracts visual features using CLIP (OpenAI's vision model)
3. Compares features against reference images for all models
4. Returns the best matching model with confidence score

### Confidence Score
- Range: 0.0 to 1.0 (0% to 100%)
- > 0.8: High confidence match
- 0.6 - 0.8: Medium confidence
- < 0.6: Low confidence (may not be accurate)

### Tips for Better Matching
1. Upload clear, well-lit photos
2. Multiple angles improve accuracy
3. Ensure reference images are high quality
4. Rebuild embeddings after adding new models

---

## Storage

Models and reference images are stored in Wasabi S3:
- **Bucket:** `jigu`
- **Region:** `eu-west-1`
- **Endpoint:** `s3.eu-west-1.wasabisys.com`

GLB files are stored at root level, reference images in `reference_images/` folder.

---

## Rate Limits

Currently no rate limits are enforced. For production use, consider:
- Rate limiting per IP
- File size limits (currently unlimited)
- Authentication/API keys

---

## Development

### Start Backend
```bash
cd backend
node server.mjs
```

### Start Frontend
```bash
cd frontend
npm run dev
```

### Environment Variables
Configure in `backend/server.mjs`:
- `PORT`: Server port (default: 5000)
- S3 credentials (currently hardcoded)

---

## Support

For issues or questions:
1. Check console logs in browser (F12)
2. Check backend terminal output
3. Verify Python dependencies are installed
4. Ensure reference images exist and embeddings are built
