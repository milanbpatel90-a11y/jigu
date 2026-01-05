# API Key & Secret Key Authentication Guide

## Overview

The dashboard supports optional API key authentication to secure your endpoints. When enabled, all API requests must include valid API key and secret key headers.

## Quick Start

### 1. Create Your First API Key

```bash
cd backend
node manage-keys.mjs create "My Dashboard App"
```

This will output:
```
✓ API Key created successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:        My Dashboard App
Permissions: read, write

API Key:     a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
Secret Key:  1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9w0x1y2z3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT: Save these keys securely!
   The secret key will not be shown again.
```

**⚠️ IMPORTANT:** Save both keys immediately! The secret key cannot be retrieved later.

### 2. Enable Authentication

Set environment variable before starting the server:

**Windows (CMD):**
```cmd
set REQUIRE_AUTH=true
node server.mjs
```

**Windows (PowerShell):**
```powershell
$env:REQUIRE_AUTH="true"
node server.mjs
```

**Linux/Mac:**
```bash
REQUIRE_AUTH=true node server.mjs
```

### 3. Use API Keys in Requests

Include headers in all API requests:

```bash
curl http://localhost:5000/models \
  -H "X-API-Key: your-api-key-here" \
  -H "X-Secret-Key: your-secret-key-here"
```

## Management Commands

### Create API Key

```bash
# Basic (read + write permissions)
node manage-keys.mjs create "App Name"

# Custom permissions
node manage-keys.mjs create "Admin App" read,write,admin
node manage-keys.mjs create "Read Only App" read
```

### List All Keys

```bash
node manage-keys.mjs list
```

Output:
```
API Keys:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. My Dashboard App
   API Key:     a1b2c3d4e5f6...
   Permissions: read, write
   Created:     11/30/2025, 10:30:45 AM
   Last Used:   11/30/2025, 2:15:22 PM
   Usage Count: 127

2. Mobile App
   API Key:     x9y8z7w6v5u4...
   Permissions: read
   Created:     11/29/2025, 3:20:10 PM
   Last Used:   Never
   Usage Count: 0
```

### Show Key Details

```bash
node manage-keys.mjs show a1b2c3d4e5f6...
```

### Delete API Key

```bash
node manage-keys.mjs delete a1b2c3d4e5f6...
```

## Permissions

### `read`
- `GET /models` - List all models
- `POST /match-model` - AI matching

### `write`
- `POST /upload-model` - Upload new models
- `POST /rebuild-embeddings` - Rebuild AI index

### `admin`
- Full access to all operations
- Future: User management, analytics

## Using with Frontend

### Update Frontend Code

Edit `frontend/src/App.jsx` and `frontend/src/Viewer.jsx`:

```javascript
const API = "http://localhost:5000";
const API_KEY = "your-api-key-here";
const SECRET_KEY = "your-secret-key-here";

// Add headers to all fetch requests
const headers = {
  "X-API-Key": API_KEY,
  "X-Secret-Key": SECRET_KEY
};

// Example
fetch(`${API}/models`, { headers })
  .then(r => r.json())
  .then(data => console.log(data));
```

### Environment Variables (Recommended)

Create `frontend/.env`:
```
VITE_API_KEY=your-api-key-here
VITE_SECRET_KEY=your-secret-key-here
```

Use in code:
```javascript
const API_KEY = import.meta.env.VITE_API_KEY;
const SECRET_KEY = import.meta.env.VITE_SECRET_KEY;
```

## API Examples

### JavaScript/Fetch

```javascript
const API_KEY = "your-api-key";
const SECRET_KEY = "your-secret-key";

const headers = {
  "X-API-Key": API_KEY,
  "X-Secret-Key": SECRET_KEY
};

// Get models
const models = await fetch('http://localhost:5000/models', { headers })
  .then(r => r.json());

// Match images
const formData = new FormData();
formData.append('images', imageFile);

const match = await fetch('http://localhost:5000/match-model', {
  method: 'POST',
  headers,
  body: formData
}).then(r => r.json());
```

### Python

```python
import requests

API_KEY = "your-api-key"
SECRET_KEY = "your-secret-key"

headers = {
    "X-API-Key": API_KEY,
    "X-Secret-Key": SECRET_KEY
}

# Get models
response = requests.get('http://localhost:5000/models', headers=headers)
models = response.json()

# Match images
files = {'images': open('photo.jpg', 'rb')}
response = requests.post(
    'http://localhost:5000/match-model',
    headers=headers,
    files=files
)
match = response.json()
```

### cURL

```bash
API_KEY="your-api-key"
SECRET_KEY="your-secret-key"

# Get models
curl http://localhost:5000/models \
  -H "X-API-Key: $API_KEY" \
  -H "X-Secret-Key: $SECRET_KEY"

# Match images
curl -X POST http://localhost:5000/match-model \
  -H "X-API-Key: $API_KEY" \
  -H "X-Secret-Key: $SECRET_KEY" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg"
```

## Error Responses

### Missing Keys
```json
{
  "error": "Missing API key or secret key",
  "message": "Include X-API-Key and X-Secret-Key headers"
}
```
**Status:** 401 Unauthorized

### Invalid Keys
```json
{
  "error": "Invalid API key"
}
```
**Status:** 401 Unauthorized

### Insufficient Permissions
```json
{
  "error": "Insufficient permissions",
  "required": "write"
}
```
**Status:** 403 Forbidden

## Security Best Practices

### 1. Keep Keys Secret
- Never commit keys to version control
- Use environment variables
- Don't expose in client-side code
- Rotate keys regularly

### 2. Use HTTPS in Production
```javascript
const API = "https://your-domain.com/api";
```

### 3. Separate Keys by Environment
```bash
# Development
node manage-keys.mjs create "Dev App"

# Production
node manage-keys.mjs create "Prod App"
```

### 4. Monitor Usage
```bash
# Check usage regularly
node manage-keys.mjs list
```

### 5. Delete Unused Keys
```bash
node manage-keys.mjs delete old-api-key
```

## Storage

API keys are stored in `backend/api_keys.json`:

```json
{
  "a1b2c3d4...": {
    "name": "My App",
    "secretKey": "1a2b3c4d...",
    "permissions": ["read", "write"],
    "createdAt": "2025-11-30T10:30:45.123Z",
    "lastUsed": "2025-11-30T14:15:22.456Z",
    "usageCount": 127
  }
}
```

**⚠️ IMPORTANT:** 
- Backup this file regularly
- Add to `.gitignore`
- Restrict file permissions (chmod 600)

## Disabling Authentication

To disable authentication (development only):

```bash
# Don't set REQUIRE_AUTH, or set to false
node server.mjs
```

Or in code (`server.mjs`):
```javascript
const REQUIRE_AUTH = false;
```

## Production Deployment

### 1. Create Production Keys
```bash
node manage-keys.mjs create "Production Dashboard" read,write
node manage-keys.mjs create "Production Mobile" read
```

### 2. Set Environment Variable
```bash
export REQUIRE_AUTH=true
```

### 3. Secure api_keys.json
```bash
chmod 600 api_keys.json
```

### 4. Use Secrets Manager (Recommended)
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault
- Environment variables in hosting platform

## Troubleshooting

### "Module not found: auth.mjs"
Make sure `auth.mjs` exists in the backend folder.

### "Cannot find module 'crypto'"
Crypto is built into Node.js. Update Node.js to v16+.

### Keys not working
1. Check keys are correct (no extra spaces)
2. Verify authentication is enabled
3. Check headers are being sent
4. Review server logs

### Lost secret key
Secret keys cannot be recovered. Create a new API key:
```bash
node manage-keys.mjs delete old-key
node manage-keys.mjs create "New Key"
```

## Support

For issues:
1. Check server logs
2. Verify keys with `node manage-keys.mjs list`
3. Test with cURL first
4. Check CORS settings
