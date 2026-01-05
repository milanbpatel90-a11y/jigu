# Webhook Integration Guide

## Overview

The AI Glasses Dashboard can automatically push match results to your external application via webhooks. When a user finds a matching 3D model, the result is instantly sent to your configured endpoint.

## Quick Start

### 1. Add Your Webhook Endpoint

```bash
cd backend
node manage-webhooks.mjs add "https://your-app.com/api/webhook" "My App"
```

### 2. Test the Webhook

```bash
node manage-webhooks.mjs test "https://your-app.com/api/webhook"
```

### 3. Start Receiving Results

Webhooks are automatically enabled. When a match is found, your endpoint receives:

```json
{
  "event": "match",
  "timestamp": "2025-11-30T14:30:45.123Z",
  "data": {
    "best_model": "ray_ban_glasses.glb",
    "confidence": 0.87,
    "source_image": "ray_ban_glasses.jpg",
    "model_url": "https://jigu.s3.eu-west-1.wasabisys.com/ray_ban_glasses.glb?...",
    "timestamp": "2025-11-30T14:30:45.123Z",
    "images_count": 3
  }
}
```

## Webhook Payload Structure

### Match Event

Triggered when AI finds a matching model.

```json
{
  "event": "match",
  "timestamp": "2025-11-30T14:30:45.123Z",
  "data": {
    "best_model": "glasses_model.glb",
    "confidence": 0.87,
    "source_image": "reference_image.jpg",
    "model_url": "https://signed-url-to-3d-model",
    "timestamp": "2025-11-30T14:30:45.123Z",
    "images_count": 3
  }
}
```

**Fields:**
- `event`: Always "match" for matching events
- `timestamp`: ISO 8601 timestamp when webhook was sent
- `data.best_model`: Filename of the matched 3D model
- `data.confidence`: Match confidence (0.0 to 1.0)
- `data.source_image`: Reference image used for matching
- `data.model_url`: Signed URL to download the 3D model (valid for 1 hour)
- `data.timestamp`: When the match was performed
- `data.images_count`: Number of images uploaded by user

### Upload Event (Future)

Triggered when a new model is uploaded.

```json
{
  "event": "upload",
  "timestamp": "2025-11-30T14:30:45.123Z",
  "data": {
    "model_name": "new_glasses.glb",
    "has_thumbnail": true,
    "uploaded_by": "api_key_name"
  }
}
```

### Rebuild Event (Future)

Triggered when embeddings are rebuilt.

```json
{
  "event": "rebuild",
  "timestamp": "2025-11-30T14:30:45.123Z",
  "data": {
    "models_count": 167,
    "success": true
  }
}
```

## Implementing Your Webhook Endpoint

### Node.js/Express Example

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/webhook', (req, res) => {
  const { event, timestamp, data } = req.body;
  
  console.log(`Received ${event} event at ${timestamp}`);
  
  if (event === 'match') {
    // Process the match result
    console.log(`Best match: ${data.best_model}`);
    console.log(`Confidence: ${(data.confidence * 100).toFixed(1)}%`);
    console.log(`Model URL: ${data.model_url}`);
    
    // Store in database
    saveMatchResult(data);
    
    // Trigger other actions
    notifyUser(data);
    updateInventory(data.best_model);
  }
  
  // Always respond with 200 OK
  res.status(200).json({ received: true });
});

app.listen(3000, () => {
  console.log('Webhook receiver running on port 3000');
});
```

### Python/Flask Example

```python
from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

@app.route('/api/webhook', methods=['POST'])
def webhook():
    payload = request.json
    event = payload.get('event')
    timestamp = payload.get('timestamp')
    data = payload.get('data')
    
    print(f"Received {event} event at {timestamp}")
    
    if event == 'match':
        # Process the match result
        print(f"Best match: {data['best_model']}")
        print(f"Confidence: {data['confidence'] * 100:.1f}%")
        print(f"Model URL: {data['model_url']}")
        
        # Store in database
        save_match_result(data)
        
        # Trigger other actions
        notify_user(data)
        update_inventory(data['best_model'])
    
    # Always respond with 200 OK
    return jsonify({'received': True}), 200

if __name__ == '__main__':
    app.run(port=3000)
```

### PHP Example

```php
<?php
header('Content-Type: application/json');

// Get the webhook payload
$payload = json_decode(file_get_contents('php://input'), true);

$event = $payload['event'];
$timestamp = $payload['timestamp'];
$data = $payload['data'];

error_log("Received $event event at $timestamp");

if ($event === 'match') {
    // Process the match result
    $bestModel = $data['best_model'];
    $confidence = $data['confidence'] * 100;
    $modelUrl = $data['model_url'];
    
    error_log("Best match: $bestModel");
    error_log("Confidence: $confidence%");
    
    // Store in database
    saveMatchResult($data);
    
    // Trigger other actions
    notifyUser($data);
    updateInventory($bestModel);
}

// Always respond with 200 OK
http_response_code(200);
echo json_encode(['received' => true]);
?>
```

## Management Commands

### Add Webhook

```bash
# Basic
node manage-webhooks.mjs add "https://api.example.com/webhook" "My App"

# With specific events
node manage-webhooks.mjs add "https://api.example.com/webhook" "My App" match,upload

# Multiple webhooks
node manage-webhooks.mjs add "https://app1.com/webhook" "App 1"
node manage-webhooks.mjs add "https://app2.com/webhook" "App 2"
```

### List Webhooks

```bash
node manage-webhooks.mjs list
```

Output:
```
Configured Webhooks:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. My App ✓
   ID:             1701234567890
   URL:            https://api.example.com/webhook
   Events:         match
   Success:        127
   Failures:       3
   Last Triggered: 11/30/2025, 2:15:22 PM

2. Backup App ✓
   ID:             1701234567891
   URL:            https://backup.example.com/webhook
   Events:         match, upload
   Success:        45
   Failures:       0
   Last Triggered: 11/30/2025, 1:45:10 PM
```

### Test Webhook

```bash
node manage-webhooks.mjs test "https://api.example.com/webhook"
```

### Remove Webhook

```bash
node manage-webhooks.mjs remove 1701234567890
```

### View Statistics

```bash
node manage-webhooks.mjs stats
```

### Enable/Disable All Webhooks

```bash
# Disable temporarily
node manage-webhooks.mjs disable

# Re-enable
node manage-webhooks.mjs enable
```

## Advanced Configuration

### Custom Headers

Edit `webhook_config.json`:

```json
{
  "enabled": true,
  "endpoints": [
    {
      "id": "1701234567890",
      "name": "My App",
      "url": "https://api.example.com/webhook",
      "headers": {
        "Authorization": "Bearer your-token-here",
        "X-Custom-Header": "custom-value"
      },
      "events": ["match"],
      "enabled": true
    }
  ]
}
```

### Webhook Retry Logic

Currently, webhooks are sent once. For production, consider:

1. **Implement retry in your app**
2. **Use a queue service** (RabbitMQ, Redis)
3. **Use webhook services** (Zapier, Webhook.site)

## Security

### Verify Webhook Source

Add a secret token to headers:

```json
{
  "headers": {
    "X-Webhook-Secret": "your-secret-token-here"
  }
}
```

Verify in your endpoint:

```javascript
app.post('/api/webhook', (req, res) => {
  const secret = req.headers['x-webhook-secret'];
  
  if (secret !== 'your-secret-token-here') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Process webhook...
});
```

### Use HTTPS

Always use HTTPS endpoints in production:
```bash
node manage-webhooks.mjs add "https://api.example.com/webhook" "My App"
```

### IP Whitelisting

Whitelist your dashboard server IP in your application firewall.

## Testing Webhooks

### Local Testing with ngrok

```bash
# Install ngrok
# https://ngrok.com/download

# Start your local server
node your-server.js

# Expose to internet
ngrok http 3000

# Use the ngrok URL
node manage-webhooks.mjs add "https://abc123.ngrok.io/webhook" "Test"
```

### Testing with Webhook.site

```bash
# Go to https://webhook.site
# Copy your unique URL
node manage-webhooks.mjs add "https://webhook.site/your-unique-id" "Test"

# Trigger a match in the dashboard
# View the payload on webhook.site
```

### Testing with RequestBin

```bash
# Go to https://requestbin.com
# Create a bin
node manage-webhooks.mjs add "https://requestbin.com/your-bin" "Test"
```

## Use Cases

### 1. E-commerce Integration

```javascript
app.post('/api/webhook', async (req, res) => {
  const { data } = req.body;
  
  // Add to shopping cart
  await addToCart(userId, {
    product: data.best_model,
    confidence: data.confidence,
    modelUrl: data.model_url
  });
  
  // Send email
  await sendEmail(userEmail, {
    subject: 'We found your perfect glasses!',
    model: data.best_model,
    confidence: `${(data.confidence * 100).toFixed(0)}%`
  });
  
  res.json({ received: true });
});
```

### 2. Analytics Tracking

```javascript
app.post('/api/webhook', async (req, res) => {
  const { data } = req.body;
  
  // Track in analytics
  analytics.track('Model Matched', {
    model: data.best_model,
    confidence: data.confidence,
    images_count: data.images_count,
    timestamp: data.timestamp
  });
  
  res.json({ received: true });
});
```

### 3. Inventory Management

```javascript
app.post('/api/webhook', async (req, res) => {
  const { data } = req.body;
  
  // Check inventory
  const inStock = await checkInventory(data.best_model);
  
  if (!inStock) {
    await notifySupplier(data.best_model);
  }
  
  // Update popular items
  await incrementPopularity(data.best_model);
  
  res.json({ received: true });
});
```

### 4. CRM Integration

```javascript
app.post('/api/webhook', async (req, res) => {
  const { data } = req.body;
  
  // Update CRM
  await crm.createLead({
    source: 'AI Glasses Finder',
    product_interest: data.best_model,
    confidence: data.confidence,
    timestamp: data.timestamp
  });
  
  res.json({ received: true });
});
```

## Troubleshooting

### Webhook not receiving data

1. **Check webhook is enabled**
   ```bash
   node manage-webhooks.mjs list
   ```

2. **Test the endpoint**
   ```bash
   node manage-webhooks.mjs test "your-url"
   ```

3. **Check server logs**
   Look for webhook errors in backend console

4. **Verify URL is accessible**
   ```bash
   curl -X POST https://your-url \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

### Webhook timing out

- Respond quickly (< 5 seconds)
- Process data asynchronously
- Return 200 OK immediately

```javascript
app.post('/api/webhook', (req, res) => {
  // Respond immediately
  res.status(200).json({ received: true });
  
  // Process asynchronously
  processWebhook(req.body).catch(console.error);
});
```

### High failure rate

Check `webhook_config.json` for error patterns:
```bash
node manage-webhooks.mjs stats
```

Common issues:
- Endpoint down
- Timeout (> 10 seconds)
- Invalid SSL certificate
- Firewall blocking requests

## Best Practices

1. **Always respond with 200 OK**
2. **Process data asynchronously**
3. **Implement idempotency** (handle duplicate webhooks)
4. **Log all webhook events**
5. **Monitor failure rates**
6. **Use HTTPS in production**
7. **Validate webhook payload**
8. **Set up alerts for failures**

## Support

For issues:
1. Check webhook stats: `node manage-webhooks.mjs stats`
2. Test endpoint: `node manage-webhooks.mjs test <url>`
3. Review server logs
4. Verify endpoint is accessible
