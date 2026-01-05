#!/usr/bin/env node

import {
  addWebhook,
  removeWebhook,
  listWebhooks,
  testWebhook,
  getWebhookStats,
  loadWebhookConfig,
  saveWebhookConfig
} from "./webhook.mjs";

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
Webhook Management Tool
=======================

Commands:
  add <url> <name> [events]    Add a new webhook endpoint
  list                         List all webhooks
  remove <id>                  Remove a webhook
  test <url>                   Test a webhook URL
  stats                        Show webhook statistics
  enable                       Enable all webhooks
  disable                      Disable all webhooks
  help                         Show this help message

Examples:
  node manage-webhooks.mjs add "https://api.example.com/webhook" "My App"
  node manage-webhooks.mjs add "https://api.example.com/webhook" "My App" match,upload
  node manage-webhooks.mjs list
  node manage-webhooks.mjs test "https://api.example.com/webhook"
  node manage-webhooks.mjs remove 1234567890
  node manage-webhooks.mjs stats

Events:
  match   - Triggered when AI finds a matching model
  upload  - Triggered when a new model is uploaded
  rebuild - Triggered when embeddings are rebuilt
`);
}

function formatDate(dateString) {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleString();
}

switch (command) {
  case "add": {
    const url = args[1];
    const name = args[2];
    
    if (!url || !name) {
      console.error("Error: URL and name are required");
      console.log("Usage: node manage-webhooks.mjs add <url> <name> [events]");
      process.exit(1);
    }
    
    const eventsArg = args[3] || "match";
    const events = eventsArg.split(",").map(e => e.trim());
    
    const webhook = addWebhook(url, name, {}, events);
    
    console.log("\n✓ Webhook added successfully!\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`ID:     ${webhook.id}`);
    console.log(`Name:   ${webhook.name}`);
    console.log(`URL:    ${webhook.url}`);
    console.log(`Events: ${webhook.events.join(", ")}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    break;
  }
  
  case "list": {
    const webhooks = listWebhooks();
    
    if (webhooks.length === 0) {
      console.log("\nNo webhooks configured.");
      console.log("Add one with: node manage-webhooks.mjs add <url> <name>\n");
      break;
    }
    
    console.log("\nConfigured Webhooks:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    webhooks.forEach((webhook, index) => {
      console.log(`${index + 1}. ${webhook.name} ${webhook.enabled ? "✓" : "✗"}`);
      console.log(`   ID:            ${webhook.id}`);
      console.log(`   URL:           ${webhook.url}`);
      console.log(`   Events:        ${webhook.events.join(", ")}`);
      console.log(`   Success:       ${webhook.successCount}`);
      console.log(`   Failures:      ${webhook.failureCount}`);
      console.log(`   Last Triggered: ${formatDate(webhook.lastTriggered)}`);
      console.log();
    });
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    break;
  }
  
  case "remove": {
    const id = args[1];
    
    if (!id) {
      console.error("Error: Webhook ID is required");
      console.log("Usage: node manage-webhooks.mjs remove <id>");
      process.exit(1);
    }
    
    const success = removeWebhook(id);
    
    if (success) {
      console.log(`\n✓ Webhook removed: ${id}\n`);
    } else {
      console.error(`\n✗ Webhook not found: ${id}\n`);
      process.exit(1);
    }
    break;
  }
  
  case "test": {
    const url = args[1];
    
    if (!url) {
      console.error("Error: URL is required");
      console.log("Usage: node manage-webhooks.mjs test <url>");
      process.exit(1);
    }
    
    console.log(`\nTesting webhook: ${url}\n`);
    
    testWebhook(url).then(result => {
      if (result.success) {
        console.log("✓ Webhook test successful!\n");
        console.log(`Status: ${result.statusCode} ${result.statusText}`);
        console.log(`Response: ${result.body}\n`);
      } else {
        console.error("✗ Webhook test failed!\n");
        console.error(`Error: ${result.error || result.statusText}\n`);
        process.exit(1);
      }
    });
    break;
  }
  
  case "stats": {
    const stats = getWebhookStats();
    
    console.log("\nWebhook Statistics:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Status:          ${stats.enabled ? "Enabled ✓" : "Disabled ✗"}`);
    console.log(`Total Webhooks:  ${stats.totalWebhooks}`);
    console.log(`Active Webhooks: ${stats.activeWebhooks}`);
    console.log(`Total Success:   ${stats.totalSuccess}`);
    console.log(`Total Failures:  ${stats.totalFailures}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    if (stats.webhooks.length > 0) {
      console.log("Individual Webhook Stats:\n");
      stats.webhooks.forEach((webhook, index) => {
        console.log(`${index + 1}. ${webhook.name}`);
        console.log(`   Success: ${webhook.successCount} | Failures: ${webhook.failureCount}`);
        console.log(`   Last: ${formatDate(webhook.lastTriggered)}`);
        console.log();
      });
    }
    break;
  }
  
  case "enable": {
    const config = loadWebhookConfig();
    config.enabled = true;
    saveWebhookConfig(config);
    console.log("\n✓ Webhooks enabled\n");
    break;
  }
  
  case "disable": {
    const config = loadWebhookConfig();
    config.enabled = false;
    saveWebhookConfig(config);
    console.log("\n✓ Webhooks disabled\n");
    break;
  }
  
  case "help":
  default:
    printHelp();
    break;
}
