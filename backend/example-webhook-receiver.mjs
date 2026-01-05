#!/usr/bin/env node

/**
 * Example Webhook Receiver
 * 
 * This is a simple server that receives webhooks from the AI Glasses Dashboard.
 * Use this as a template for your own webhook integration.
 * 
 * Usage:
 *   node example-webhook-receiver.mjs [port]
 * 
 * Example:
 *   node example-webhook-receiver.mjs 3000
 */

import express from "express";

const app = express();
const PORT = process.argv[2] || 3000;

app.use(express.json());

// Webhook endpoint
app.post("/webhook", (req, res) => {
  const { event, timestamp, data } = req.body;
  
  console.log("\n" + "=".repeat(60));
  console.log(`📨 Webhook Received: ${event}`);
  console.log("=".repeat(60));
  console.log(`⏰ Timestamp: ${timestamp}`);
  console.log();
  
  if (event === "match") {
    console.log("🎯 Match Result:");
    console.log(`   Model:      ${data.best_model}`);
    console.log(`   Confidence: ${(data.confidence * 100).toFixed(1)}%`);
    console.log(`   Reference:  ${data.source_image}`);
    console.log(`   Images:     ${data.images_count}`);
    console.log(`   Model URL:  ${data.model_url.substring(0, 60)}...`);
    console.log();
    
    // Example: Process the result
    processMatchResult(data);
  } else if (event === "test") {
    console.log("✅ Test webhook received successfully!");
    console.log(`   Message: ${data.message}`);
    console.log();
  } else {
    console.log("📦 Data:", JSON.stringify(data, null, 2));
    console.log();
  }
  
  console.log("=".repeat(60) + "\n");
  
  // Always respond with 200 OK
  res.status(200).json({ 
    received: true,
    event,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    service: "Webhook Receiver",
    uptime: process.uptime()
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "AI Glasses Dashboard - Webhook Receiver",
    endpoints: {
      webhook: "POST /webhook",
      health: "GET /health"
    },
    usage: "Send POST requests to /webhook to receive match results"
  });
});

// Example processing function
function processMatchResult(data) {
  // This is where you would:
  // - Save to database
  // - Send notifications
  // - Update inventory
  // - Trigger other workflows
  
  console.log("💾 Processing match result...");
  
  // Example: Log to file
  // fs.appendFileSync('matches.log', JSON.stringify(data) + '\n');
  
  // Example: Send to database
  // await db.matches.insert(data);
  
  // Example: Send notification
  // await sendEmail(user, `Found match: ${data.best_model}`);
  
  console.log("✅ Processing complete");
}

// Start server
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 Webhook Receiver Started");
  console.log("=".repeat(60));
  console.log(`📍 Listening on: http://localhost:${PORT}`);
  console.log(`📨 Webhook URL:  http://localhost:${PORT}/webhook`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log();
  console.log("To add this webhook to the dashboard:");
  console.log(`  node manage-webhooks.mjs add "http://localhost:${PORT}/webhook" "Test Receiver"`);
  console.log();
  console.log("Waiting for webhooks...");
  console.log("=".repeat(60) + "\n");
});

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down webhook receiver...\n");
  process.exit(0);
});
