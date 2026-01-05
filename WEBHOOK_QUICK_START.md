# Webhook Quick Start Guide

## 🚀 Get Started in 3 Minutes

### Step 1: Test with Example Receiver (30 seconds)

Open a new terminal and run:

```bash
cd backend
node example-webhook-receiver.mjs 3000
```

You'll see:
```
============================================================
🚀 Webhook Receiver Started
============================================================
📍 Listening on: http://localhost:3000
📨 Webhook URL:  http://localhost:3000/webhook
💚 Health check: http://localhost:3000/health

Waiting for webhooks...
============================================================
```

### Step 2: Add the Webhook (30 seconds)

Open another terminal:

```bash
cd backend
node manage-webhooks.mjs add "http://localhost:3000/webhook" "Test Receiver"
```

Output:
```
✓ Webhook added successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID:     1701234567890
Name:   Test Receiver
URL:    http://localhost:3000/webhook
Events: match
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: Test It! (2 minutes)

1. Go to http://localhost:5174/
2. Upload 1-4 glasses images
3. Click "Find 3D Model"
4. Watch the webhook receiver terminal!

You'll see:
```
============================================================
📨 Webhook Received: match
============================================================
⏰ Timestamp: 2025-11-30T14:30:45.123Z

🎯 Match Result:
   Model:      ray_ban_glasses.glb
   Confidence: 87.0%
   Reference:  ray_ban_glasses.jpg
   Images:     3
   Model URL:  https://jigu.s3.eu-west-1.wasabisys.com/ray_ban_glasses...

💾 Processing match result...
✅ Processing complete
============================================================
```

## 🎯 Real Integration

### Your App Endpoint

Create an endpoint in your app:

```javascript
// Node.js/Express
app.post('/api/glasses-webhook', (req, res) => {
  const { data } = req.body;
  
  // Save to database
  await db.matches.create({
    model: data.best_model,
    confidence: data.confidence,
    timestamp: data.timestamp
  });
  
  // Notify user
  await notifyUser(userId, {
    model: data.best_model,
    url: data.model_url
  });
  
  res.json({ received: true });
});
```

### Add Your Webhook

```bash
node manage-webhooks.mjs add "https://your-app.com/api/glasses-webhook" "Production"
```

### Done! 🎉

Your app now receives match results automatically!

## 📊 Monitor Webhooks

```bash
# View all webhooks
node manage-webhooks.mjs list

# Check statistics
node manage-webhooks.mjs stats

# Test endpoint
node manage-webhooks.mjs test "https://your-app.com/api/webhook"
```

## 🔧 Manage Webhooks

```bash
# Disable temporarily
node manage-webhooks.mjs disable

# Re-enable
node manage-webhooks.mjs enable

# Remove webhook
node manage-webhooks.mjs remove <webhook-id>
```

## 📚 Full Documentation

See `WEBHOOK_INTEGRATION_GUIDE.md` for:
- Complete payload structure
- Security best practices
- Advanced configuration
- Multiple language examples
- Troubleshooting guide

## 💡 Common Use Cases

### E-commerce
```javascript
// Add matched product to cart
await addToCart(userId, data.best_model);
```

### Analytics
```javascript
// Track in Google Analytics
gtag('event', 'model_matched', {
  model: data.best_model,
  confidence: data.confidence
});
```

### CRM
```javascript
// Create lead in Salesforce
await salesforce.leads.create({
  product: data.best_model,
  source: 'AI Finder'
});
```

### Notifications
```javascript
// Send SMS via Twilio
await twilio.messages.create({
  to: userPhone,
  body: `We found your perfect glasses: ${data.best_model}!`
});
```

## 🆘 Need Help?

1. **Test webhook**: `node manage-webhooks.mjs test <url>`
2. **Check stats**: `node manage-webhooks.mjs stats`
3. **View logs**: Check backend terminal
4. **Example code**: See `example-webhook-receiver.mjs`

## 🎓 Next Steps

1. ✅ Test with example receiver
2. ✅ Add your production webhook
3. ✅ Implement your endpoint
4. ✅ Monitor webhook stats
5. ✅ Set up error alerts

Happy integrating! 🚀
