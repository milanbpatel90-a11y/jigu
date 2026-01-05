import crypto from "crypto";
import fs from "fs";

const API_KEYS_FILE = "api_keys.json";

// Generate a secure API key
export function generateApiKey() {
  return crypto.randomBytes(32).toString("hex");
}

// Generate a secure secret key
export function generateSecretKey() {
  return crypto.randomBytes(64).toString("hex");
}

// Load API keys from file
export function loadApiKeys() {
  if (!fs.existsSync(API_KEYS_FILE)) {
    return {};
  }
  try {
    const data = fs.readFileSync(API_KEYS_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Error loading API keys:", e);
    return {};
  }
}

// Save API keys to file
export function saveApiKeys(keys) {
  try {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    return true;
  } catch (e) {
    console.error("Error saving API keys:", e);
    return false;
  }
}

// Create a new API key
export function createApiKey(name, permissions = ["read", "write"]) {
  const keys = loadApiKeys();
  const apiKey = generateApiKey();
  const secretKey = generateSecretKey();
  
  keys[apiKey] = {
    name,
    secretKey,
    permissions,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    usageCount: 0
  };
  
  saveApiKeys(keys);
  
  return { apiKey, secretKey };
}

// Verify API key and secret
export function verifyApiKey(apiKey, secretKey) {
  const keys = loadApiKeys();
  
  if (!keys[apiKey]) {
    return { valid: false, error: "Invalid API key" };
  }
  
  if (keys[apiKey].secretKey !== secretKey) {
    return { valid: false, error: "Invalid secret key" };
  }
  
  // Update usage stats
  keys[apiKey].lastUsed = new Date().toISOString();
  keys[apiKey].usageCount++;
  saveApiKeys(keys);
  
  return { 
    valid: true, 
    permissions: keys[apiKey].permissions,
    name: keys[apiKey].name
  };
}

// Check if API key has permission
export function hasPermission(apiKey, permission) {
  const keys = loadApiKeys();
  
  if (!keys[apiKey]) {
    return false;
  }
  
  return keys[apiKey].permissions.includes(permission);
}

// List all API keys (without secrets)
export function listApiKeys() {
  const keys = loadApiKeys();
  const result = [];
  
  for (const [apiKey, data] of Object.entries(keys)) {
    result.push({
      apiKey,
      name: data.name,
      permissions: data.permissions,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed,
      usageCount: data.usageCount
    });
  }
  
  return result;
}

// Delete an API key
export function deleteApiKey(apiKey) {
  const keys = loadApiKeys();
  
  if (!keys[apiKey]) {
    return false;
  }
  
  delete keys[apiKey];
  saveApiKeys(keys);
  return true;
}

// Middleware for Express
export function authMiddleware(requiredPermission = null) {
  return (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    const secretKey = req.headers["x-secret-key"];
    
    if (!apiKey || !secretKey) {
      return res.status(401).json({ 
        error: "Missing API key or secret key",
        message: "Include X-API-Key and X-Secret-Key headers"
      });
    }
    
    const verification = verifyApiKey(apiKey, secretKey);
    
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }
    
    // Check permission if required
    if (requiredPermission && !verification.permissions.includes(requiredPermission)) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required: requiredPermission
      });
    }
    
    req.apiKeyInfo = verification;
    next();
  };
}
