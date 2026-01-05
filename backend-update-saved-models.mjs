// Saved Models Storage - JSON file based (100% free)
import fs from 'fs';
import path from 'path';

const SAVED_MODELS_FILE = 'saved-models.json';

// Initialize file if it doesn't exist
function initStorage() {
    if (!fs.existsSync(SAVED_MODELS_FILE)) {
        fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify([], null, 2));
    }
}

// Get all saved models
export function getSavedModels() {
    initStorage();
    try {
        const data = fs.readFileSync(SAVED_MODELS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading saved models:', e);
        return [];
    }
}

// Save a new model
export function saveModel(model) {
    initStorage();
    const models = getSavedModels();
    
    // Generate unique ID
    const id = 'GL-' + Math.random().toString(36).substring(2, 15).toUpperCase();
    
    const newModel = {
        id,
        name: model.name,
        glbUrl: model.glbUrl || model.url,
        material: model.material || 'plastic',
        colors: model.colors || { lens: '#000000', frame: '#000000' },
        savedAt: new Date().toISOString()
    };
    
    // Check if model already exists (by name or URL)
    const exists = models.find(m => m.name === newModel.name || m.glbUrl === newModel.glbUrl);
    if (exists) {
        return { success: false, error: 'Model already saved', existing: exists };
    }
    
    models.unshift(newModel); // Add to beginning
    fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify(models, null, 2));
    
    return { success: true, model: newModel };
}

// Delete a saved model
export function deleteModel(id) {
    initStorage();
    const models = getSavedModels();
    const index = models.findIndex(m => m.id === id);
    
    if (index === -1) {
        return { success: false, error: 'Model not found' };
    }
    
    const deleted = models.splice(index, 1)[0];
    fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify(models, null, 2));
    
    return { success: true, deleted };
}

// Clear all saved models
export function clearAllModels() {
    fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify([], null, 2));
    return { success: true };
}
