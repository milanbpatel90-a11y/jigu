import fetch from "node-fetch";
import fs from "fs";

const WEBHOOK_CONFIG_FILE = "webhook_config.json";

// Load webhook configuration
export function loadWebhookConfig() {
  if (!fs.existsSync(WEBHOOK_CONFIG_FILE)) {
    return {
      enabled: false,
      endpoints: []
    };
  }
  try {
    const data = fs.readFileSync(WEBHOOK_CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Error loading webhook config:", e);
    return { enabled: false, endpoints: [] };
  }
}

// Save webhook configuration
export function saveWebhookConfig(config) {
  try {
    fs.writeFileSync(WEBHOOK_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error("Error saving webhook config:", e);
    return false;
  }
}

// Add webhook endpoint
export function addWebhook(url, name, headers = {}, events = ["match"]) {
  const config = loadWebhookConfig();
  
  const webhook = {
    id: Date.now().toString(),
    name,
    url,
    headers,
    events,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    successCount: 0,
    failureCount: 0
  };
  
  config.endpoints.push(webhook);
  config.enabled = true;
  saveWebhookConfig(config);
  
  return webhook;
}

// Remove webhook
export function removeWebhook(id) {
  const config = loadWebhookConfig();
  config.endpoints = config.endpoints.filter(w => w.id !== id);
  saveWebhookConfig(config);
  return true;
}

// Send webhook notification
export async function sendWebhook(event, data) {
  const config = loadWebhookConfig();
  
  if (!config.enabled || config.endpoints.length === 0) {
    return { sent: 0, failed: 0 };
  }
  
  const results = {
    sent: 0,
    failed: 0,
    details: []
  };
  
  const webhooks = config.endpoints.filter(w => 
    w.enabled && w.events.includes(event)
  );
  
  for (const webhook of webhooks) {
    try {
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data
      };
      
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...webhook.headers
        },
        body: JSON.stringify(payload),
        timeout: 10000
      });
      
      if (response.ok) {
        webhook.successCount++;
        webhook.lastTriggered = new Date().toISOString();
        results.sent++;
        results.details.push({
          webhook: webhook.name,
          status: "success",
          statusCode: response.status
        });
      } else {
        webhook.failureCount++;
        results.failed++;
        results.details.push({
          webhook: webhook.name,
          status: "failed",
          statusCode: response.status,
          error: await response.text()
        });
      }
    } catch (error) {
      webhook.failureCount++;
      results.failed++;
      results.details.push({
        webhook: webhook.name,
        status: "error",
        error: error.message
      });
    }
  }
  
  saveWebhookConfig(config);
  return results;
}

// Test webhook
export async function testWebhook(url, headers = {}) {
  try {
    const testPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook from AI Glasses Dashboard"
      }
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(testPayload),
      timeout: 10000
    });
    
    return {
      success: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      body: await response.text()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// List webhooks
export function listWebhooks() {
  const config = loadWebhookConfig();
  return config.endpoints;
}

// Get webhook stats
export function getWebhookStats() {
  const config = loadWebhookConfig();
  
  const stats = {
    enabled: config.enabled,
    totalWebhooks: config.endpoints.length,
    activeWebhooks: config.endpoints.filter(w => w.enabled).length,
    totalSuccess: 0,
    totalFailures: 0,
    webhooks: []
  };
  
  config.endpoints.forEach(webhook => {
    stats.totalSuccess += webhook.successCount;
    stats.totalFailures += webhook.failureCount;
    stats.webhooks.push({
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      enabled: webhook.enabled,
      events: webhook.events,
      successCount: webhook.successCount,
      failureCount: webhook.failureCount,
      lastTriggered: webhook.lastTriggered
    });
  });
  
  return stats;
}
