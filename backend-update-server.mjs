import 'dotenv/config';
import express from "express";
import multer from "multer";
import cors from "cors";
import { spawn } from "child_process";
import fs from "fs";
import AWS from "aws-sdk";
import path from "path";
import { authMiddleware } from "./auth.mjs";
import { sendWebhook } from "./webhook.mjs";
import { getSavedModels, saveModel, deleteModel, clearAllModels } from "./saved-models.mjs";

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(express.json());

const upload = multer({ dest: "uploads/" });

// Enable/disable authentication
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === "true" || false;

// Reference images directory
const REF_DIR = "reference_images";

// WASABI / S3 config - supports multiple env var names
const s3Endpoint = process.env.AWS_ENDPOINT || process.env.WASABI_ENDPOINT_URI || "s3.eu-west-1.wasabisys.com";
const s3Region = process.env.AWS_REGION || "eu-west-1";
const s3 = new AWS.S3({
  endpoint: `https://${s3Endpoint}`,
  region: s3Region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

const BUCKET = process.env.S3_BUCKET || "jigu";
console.log(`S3 Config: endpoint=${s3Endpoint}, region=${s3Region}, bucket=${BUCKET}`);
console.log(`AWS Credentials: key=${process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING'}`);

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync(REF_DIR)) fs.mkdirSync(REF_DIR);

// Optional auth middleware
const optionalAuth = REQUIRE_AUTH ? authMiddleware("read") : (req, res, next) => next();
const writeAuth = REQUIRE_AUTH ? authMiddleware("write") : (req, res, next) => next();

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "AI Glasses Backend" });
});

app.get("/models", optionalAuth, async (req, res) => {
  try {
    const data = await s3.listObjectsV2({ Bucket: BUCKET }).promise();
    const files = (data.Contents || [])
        .filter(f => f.Key.toLowerCase().endsWith(".glb"))
        .map(f => ({
            name: f.Key,
            url: s3.getSignedUrl("getObject", { Bucket: BUCKET, Key: f.Key, Expires: 3600 })
        }));
    console.log(`Found ${files.length} GLB models in S3`);
    res.json(files);
  } catch (e) {
    console.error("S3 error:", e.message);
    // Fallback: create models list based on local reference images
    try {
      if (fs.existsSync(REF_DIR)) {
        const refImages = fs.readdirSync(REF_DIR).filter(f => 
          f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png')
        );
        const models = refImages.map(img => {
          const base = path.parse(img).name;
          const glbName = base + '.glb';
          return {
            name: glbName,
            url: s3.getSignedUrl("getObject", { Bucket: BUCKET, Key: glbName, Expires: 3600 })
          };
        });
        console.log(`Returning ${models.length} models based on reference images`);
        res.json(models);
      } else {
        res.json([]);
      }
    } catch (fallbackError) {
      console.error("Fallback error:", fallbackError);
      res.status(500).json({ error: "Failed to list models" });
    }
  }
});

app.post("/upload-model", writeAuth, upload.fields([{ name: "file" }, { name: "thumb" }]), async (req, res) => {
  try {
    const file = req.files['file'] ? req.files['file'][0] : null;
    const thumb = req.files['thumb'] ? req.files['thumb'][0] : null;
    if (!file) return res.status(400).json({ error: "No GLB file uploaded" });

    const glbKey = file.originalname;
    await s3.upload({ Bucket: BUCKET, Key: glbKey, Body: fs.createReadStream(file.path), ContentType: "model/gltf-binary" }).promise();

    if (thumb) {
      const thumbKey = path.posix.join("reference_images", thumb.originalname);
      await s3.upload({ Bucket: BUCKET, Key: thumbKey, Body: fs.createReadStream(thumb.path), ContentType: thumb.mimetype || "image/png" }).promise();
    }

    fs.unlinkSync(file.path);
    if (thumb) fs.unlinkSync(thumb.path);

    res.json({ ok: true, name: glbKey });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.post("/rebuild-embeddings", writeAuth, async (req, res) => {
  try {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(pythonCmd, ["match.py", "--build"], { cwd: process.cwd() });
    let out = "", errOut = "";
    py.stdout.on("data", d => out += d.toString());
    py.stderr.on("data", d => errOut += d.toString());
    py.on("close", code => {
      if (code !== 0) return res.status(500).json({ error: "Rebuild failed", details: errOut || out });
      res.json({ ok: true, output: out });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to start rebuild" });
  }
});

app.post("/match-model", optionalAuth, upload.array("images", 5), async (req, res) => {
  console.log("=== Match request received ===");
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No images uploaded" });
    const filePaths = req.files.map(f => f.path);
    console.log("Running match.py with files:", filePaths);
    
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(pythonCmd, ["match.py", ...filePaths], { cwd: process.cwd() });
    let out = "", errOut = "";
    py.stdout.on("data", d => { out += d.toString(); });
    py.stderr.on("data", d => { errOut += d.toString(); console.log("Python stderr:", d.toString()); });
    py.on("close", async code => {
      console.log("Python exit code:", code);
      console.log("Python stdout:", out);
      filePaths.forEach(p => fs.unlink(p, () => {}));
      if (code !== 0) return res.status(500).json({ error: "AI matching failed", details: errOut || out });
      try {
        const jsonOut = JSON.parse(out);
        console.log("Parsed JSON:", jsonOut);
        
        // Check if there was an error in the Python output
        if (jsonOut.error) {
          console.error("Python error:", jsonOut.error);
          // Return 400 for validation rejections (user uploaded wrong type of image)
          // Return 500 for actual server/processing errors
          const statusCode = jsonOut.method === "validation_rejected" ? 400 : 500;
          return res.status(statusCode).json({ 
            error: jsonOut.error,
            method: jsonOut.method,
            validation_confidence: jsonOut.validation_confidence
          });
        }
        
        // Add model URL to response if best_model exists
        if (jsonOut.best_model) {
          jsonOut.model_url = s3.getSignedUrl("getObject", { 
            Bucket: BUCKET, 
            Key: jsonOut.best_model, 
            Expires: 3600 
          });
          console.log("Generated model URL for:", jsonOut.best_model);
        }
        
        // Send webhook notification
        sendWebhook("match", {
          ...jsonOut,
          timestamp: new Date().toISOString(),
          images_count: req.files.length
        }).catch(err => console.error("Webhook error:", err));
        
        res.json(jsonOut);
      } catch (e) {
        console.error("Parse error:", e, "Raw output:", out);
        res.status(500).json({ error: "Bad AI output", raw: out });
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ============ SAVED MODELS API ============

// Get all saved models (for try-on app)
app.get("/saved-models", optionalAuth, (req, res) => {
  try {
    const models = getSavedModels();
    console.log(`Returning ${models.length} saved models`);
    res.json(models);
  } catch (e) {
    console.error("Error getting saved models:", e);
    res.status(500).json({ error: "Failed to get saved models" });
  }
});

// Save a model to dashboard
app.post("/saved-models", optionalAuth, (req, res) => {
  try {
    const { name, glbUrl, url, material, colors } = req.body;
    
    if (!name || (!glbUrl && !url)) {
      return res.status(400).json({ error: "name and glbUrl/url are required" });
    }
    
    const result = saveModel({ name, glbUrl: glbUrl || url, material, colors });
    
    if (result.success) {
      console.log(`Saved model: ${name}`);
      res.json(result.model);
    } else {
      res.status(409).json(result); // Conflict - already exists
    }
  } catch (e) {
    console.error("Error saving model:", e);
    res.status(500).json({ error: "Failed to save model" });
  }
});

// Delete a saved model
app.delete("/saved-models/:id", optionalAuth, (req, res) => {
  try {
    const result = deleteModel(req.params.id);
    
    if (result.success) {
      console.log(`Deleted model: ${req.params.id}`);
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (e) {
    console.error("Error deleting model:", e);
    res.status(500).json({ error: "Failed to delete model" });
  }
});

// Clear all saved models
app.delete("/saved-models", writeAuth, (req, res) => {
  try {
    const result = clearAllModels();
    console.log("Cleared all saved models");
    res.json(result);
  } catch (e) {
    console.error("Error clearing models:", e);
    res.status(500).json({ error: "Failed to clear models" });
  }
});

// ============ END SAVED MODELS API ============

const PORT = process.env.PORT || 5000;

// Download reference images from S3 on startup
async function downloadReferenceImages() {
  console.log("Checking reference images in S3...");
  try {
    const data = await s3.listObjectsV2({ Bucket: BUCKET, Prefix: "reference_images/" }).promise();
    const images = (data.Contents || []).filter(f => !f.Key.endsWith("/"));
    
    if (images.length === 0) {
      console.log("No reference images found in S3 (prefix: reference_images/)");
      return;
    }
    
    const existingFiles = fs.existsSync(REF_DIR) ? fs.readdirSync(REF_DIR) : [];
    console.log(`Found ${images.length} reference images in S3, ${existingFiles.length} locally`);
    
    let downloaded = 0;
    for (const obj of images) {
      const filename = path.basename(obj.Key);
      const localPath = path.join(REF_DIR, filename);
      
      if (!fs.existsSync(localPath)) {
        console.log(`Downloading ${filename}...`);
        const fileData = await s3.getObject({ Bucket: BUCKET, Key: obj.Key }).promise();
        fs.writeFileSync(localPath, fileData.Body);
        downloaded++;
      }
    }
    console.log(`Downloaded ${downloaded} new reference images`);
  } catch (e) {
    console.error("Error downloading reference images:", e.message);
  }
}

app.listen(PORT, () => {
  console.log(`3D AI Dashboard backend running on ${PORT}`);
  // Download reference images in background (don't block startup)
  downloadReferenceImages().catch(err => {
    console.error("Background download error:", err);
  });
});

