# Add Saved Models API to Your Backend

## Step 1: Copy `saved-models.mjs` to your backend folder

## Step 2: Add these lines to `server.mjs`

### At the top (with other imports):
```javascript
import { getSavedModels, saveModel, deleteModel, clearAllModels } from "./saved-models.mjs";
```

### Add these endpoints (before `app.listen`):

```javascript
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
```

## Step 3: Deploy to Railway

```bash
git add .
git commit -m "Add saved models API"
git push
```

Railway will auto-deploy!

## API Usage:

### Get saved models (for try-on):
```
GET https://ai-glasses-backend.onrender.com/saved-models
```

### Save a model (from dashboard):
```
POST https://ai-glasses-backend.onrender.com/saved-models
Body: { "name": "glasses.glb", "glbUrl": "https://...", "material": "plastic" }
```

### Delete a model:
```
DELETE https://ai-glasses-backend.onrender.com/saved-models/GL-ABC123
```
