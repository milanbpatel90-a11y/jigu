#!/usr/bin/env node

import {
  createApiKey,
  listApiKeys,
  deleteApiKey,
  loadApiKeys
} from "./auth.mjs";

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
API Key Management Tool
=======================

Commands:
  create <name> [permissions]  Create a new API key
  list                         List all API keys
  delete <api-key>            Delete an API key
  show <api-key>              Show details of an API key
  help                        Show this help message

Examples:
  node manage-keys.mjs create "My App"
  node manage-keys.mjs create "Admin App" read,write,admin
  node manage-keys.mjs list
  node manage-keys.mjs delete abc123...
  node manage-keys.mjs show abc123...

Permissions:
  read   - Can read models and match images
  write  - Can upload models and rebuild embeddings
  admin  - Full access to all operations
`);
}

function formatDate(dateString) {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleString();
}

switch (command) {
  case "create": {
    const name = args[1];
    if (!name) {
      console.error("Error: Name is required");
      console.log("Usage: node manage-keys.mjs create <name> [permissions]");
      process.exit(1);
    }
    
    const permissionsArg = args[2] || "read,write";
    const permissions = permissionsArg.split(",").map(p => p.trim());
    
    const { apiKey, secretKey } = createApiKey(name, permissions);
    
    console.log("\n✓ API Key created successfully!\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Name:        ${name}`);
    console.log(`Permissions: ${permissions.join(", ")}`);
    console.log(`\nAPI Key:     ${apiKey}`);
    console.log(`Secret Key:  ${secretKey}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n⚠️  IMPORTANT: Save these keys securely!");
    console.log("   The secret key will not be shown again.\n");
    break;
  }
  
  case "list": {
    const keys = listApiKeys();
    
    if (keys.length === 0) {
      console.log("\nNo API keys found.");
      console.log("Create one with: node manage-keys.mjs create <name>\n");
      break;
    }
    
    console.log("\nAPI Keys:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    keys.forEach((key, index) => {
      console.log(`${index + 1}. ${key.name}`);
      console.log(`   API Key:     ${key.apiKey}`);
      console.log(`   Permissions: ${key.permissions.join(", ")}`);
      console.log(`   Created:     ${formatDate(key.createdAt)}`);
      console.log(`   Last Used:   ${formatDate(key.lastUsed)}`);
      console.log(`   Usage Count: ${key.usageCount}`);
      console.log();
    });
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    break;
  }
  
  case "delete": {
    const apiKey = args[1];
    if (!apiKey) {
      console.error("Error: API key is required");
      console.log("Usage: node manage-keys.mjs delete <api-key>");
      process.exit(1);
    }
    
    const success = deleteApiKey(apiKey);
    
    if (success) {
      console.log(`\n✓ API key deleted successfully: ${apiKey}\n`);
    } else {
      console.error(`\n✗ API key not found: ${apiKey}\n`);
      process.exit(1);
    }
    break;
  }
  
  case "show": {
    const apiKey = args[1];
    if (!apiKey) {
      console.error("Error: API key is required");
      console.log("Usage: node manage-keys.mjs show <api-key>");
      process.exit(1);
    }
    
    const keys = loadApiKeys();
    const keyData = keys[apiKey];
    
    if (!keyData) {
      console.error(`\n✗ API key not found: ${apiKey}\n`);
      process.exit(1);
    }
    
    console.log("\nAPI Key Details:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Name:        ${keyData.name}`);
    console.log(`API Key:     ${apiKey}`);
    console.log(`Permissions: ${keyData.permissions.join(", ")}`);
    console.log(`Created:     ${formatDate(keyData.createdAt)}`);
    console.log(`Last Used:   ${formatDate(keyData.lastUsed)}`);
    console.log(`Usage Count: ${keyData.usageCount}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("⚠️  Secret key is hidden for security");
    console.log("   If lost, create a new API key\n");
    break;
  }
  
  case "help":
  default:
    printHelp();
    break;
}
