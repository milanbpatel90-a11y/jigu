#!/usr/bin/env node

/**
 * Production API Monitor
 * Tests all endpoints and reports status
 */

import https from "https";
import http from "http";

// Simple fetch wrapper using native Node.js
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === "https:" ? https : http;
    
    const req = client.request(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: options.timeout || 30000
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          json: async () => JSON.parse(data),
          text: async () => data
        });
      });
    });
    
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

const API_URL = process.env.API_URL || "https://ai-glasses-backend.onrender.com";

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m"
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, url, options = {}) {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      timeout: 30000
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      log(`✅ ${name}: ${response.status} (${duration}ms)`, "green");
      return { success: true, duration, status: response.status };
    } else {
      log(`❌ ${name}: ${response.status} ${response.statusText}`, "red");
      return { success: false, duration, status: response.status };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    log(`❌ ${name}: ${error.message} (${duration}ms)`, "red");
    return { success: false, duration, error: error.message };
  }
}

async function runTests() {
  log("\n🔍 AI Glasses Backend Monitor", "blue");
  log(`Testing: ${API_URL}\n`, "blue");
  
  const results = [];
  
  // Test 1: Root endpoint
  log("Test 1: Service Info", "yellow");
  results.push(await testEndpoint(
    "GET /",
    `${API_URL}/`
  ));
  
  // Test 2: Health check
  log("\nTest 2: Health Check", "yellow");
  results.push(await testEndpoint(
    "GET /health",
    `${API_URL}/health`
  ));
  
  // Test 3: List models
  log("\nTest 3: List Models", "yellow");
  const modelsResult = await testEndpoint(
    "GET /models",
    `${API_URL}/models`
  );
  results.push(modelsResult);
  
  if (modelsResult.success) {
    try {
      const response = await fetch(`${API_URL}/models`);
      const models = await response.json();
      log(`   Found ${models.length} models`, "green");
    } catch (e) {
      log(`   Could not parse models response`, "yellow");
    }
  }
  
  // Summary
  log("\n" + "=".repeat(50), "blue");
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  const avgDuration = Math.round(
    results.reduce((sum, r) => sum + r.duration, 0) / total
  );
  
  log(`\n📊 Summary:`, "blue");
  log(`   Passed: ${passed}/${total}`, passed === total ? "green" : "red");
  log(`   Average Response Time: ${avgDuration}ms`, "blue");
  
  if (passed === total) {
    log(`\n✅ All tests passed! Service is healthy.`, "green");
  } else {
    log(`\n⚠️  Some tests failed. Check logs above.`, "yellow");
  }
  
  log("\n" + "=".repeat(50) + "\n", "blue");
  
  return passed === total;
}

// Run tests
runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    log(`\n❌ Monitor failed: ${error.message}`, "red");
    process.exit(1);
  });
