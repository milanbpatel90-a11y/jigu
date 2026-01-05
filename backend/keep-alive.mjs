#!/usr/bin/env node

/**
 * Keep-Alive Script for Render Free Tier
 * Pings the API every 10 minutes to prevent spin-down
 * 
 * Usage:
 *   node keep-alive.mjs
 *   
 * Or set up as a cron job:
 *   */10 * * * * node /path/to/keep-alive.mjs
 */

import https from "https";

// Simple fetch wrapper using native Node.js
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || "GET",
      timeout: options.timeout || 30000
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => JSON.parse(data)
        });
      });
    });
    
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    
    req.end();
  });
}

const API_URL = process.env.API_URL || "https://ai-glasses-backend.onrender.com";
const INTERVAL_MINUTES = 10;

async function ping() {
  const timestamp = new Date().toISOString();
  
  try {
    console.log(`[${timestamp}] Pinging ${API_URL}/health...`);
    
    const response = await fetch(`${API_URL}/health`, {
      timeout: 30000
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[${timestamp}] ✅ Service is alive (uptime: ${Math.round(data.uptime)}s)`);
    } else {
      console.log(`[${timestamp}] ⚠️  Service responded with ${response.status}`);
    }
  } catch (error) {
    console.log(`[${timestamp}] ❌ Ping failed: ${error.message}`);
  }
}

// Run immediately
ping();

// Then run every N minutes
if (process.argv.includes("--loop")) {
  console.log(`Starting keep-alive loop (every ${INTERVAL_MINUTES} minutes)`);
  console.log("Press Ctrl+C to stop\n");
  
  setInterval(ping, INTERVAL_MINUTES * 60 * 1000);
} else {
  console.log("\nTo run continuously, use: node keep-alive.mjs --loop");
}
