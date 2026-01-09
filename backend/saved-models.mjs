// Saved Models Storage - S3 based (persistent)
import fs from 'fs';
import AWS from 'aws-sdk';

const SAVED_MODELS_KEY = 'saved-models.json';

// S3 config (reuse from server.mjs)
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

// Use the dashboard1 bucket for saved models
const SAVED_MODELS_BUCKET = "dashboard1";

// Get all saved models from S3
export async function getSavedModels() {
    try {
        const data = await s3.getObject({ Bucket: SAVED_MODELS_BUCKET, Key: SAVED_MODELS_KEY }).promise();
        return JSON.parse(data.Body.toString());
    } catch (e) {
        if (e.code === 'NoSuchKey') {
            return []; // File doesn't exist yet
        }
        console.error('Error reading saved models from S3:', e);
        return [];
    }
}

// Save models to S3
async function saveModelsToS3(models) {
    await s3.putObject({
        Bucket: SAVED_MODELS_BUCKET,
        Key: SAVED_MODELS_KEY,
        Body: JSON.stringify(models, null, 2),
        ContentType: 'application/json'
    }).promise();
}

// Save a new model
export async function saveModel(model) {
    const models = await getSavedModels();
    
    // Generate unique ID
    const id = 'GL-' + Math.random().toString(36).substring(2, 15).toUpperCase();
    
    const newModel = {
        id,
        name: model.name,
        glbUrl: model.glbUrl || model.url,
        material: model.material || model.frameMaterial || 'plastic',
        colors: model.colors || { 
            lens: model.lensColor || '#000000', 
            frame: model.frameColor || '#000000' 
        },
        lensColor: model.lensColor || model.colors?.lens || '#000000',
        frameColor: model.frameColor || model.colors?.frame || '#000000',
        tintOpacity: model.tintOpacity || 0.5,
        frameMetalness: model.frameMetalness || 0.1,
        frameScale: model.frameScale || 1.0,
        confidence: model.confidence || 0,
        source_image: model.source_image || 'manual',
        savedAt: new Date().toISOString()
    };
    
    // Check if model already exists (by name or URL)
    const exists = models.find(m => m.name === newModel.name || m.glbUrl === newModel.glbUrl);
    if (exists) {
        return { success: false, error: 'Model already saved', existing: exists };
    }
    
    models.unshift(newModel); // Add to beginning
    await saveModelsToS3(models);
    
    console.log(`Saved model ${id}: ${newModel.name}`);
    return { success: true, model: newModel };
}

// Delete a saved model
export async function deleteModel(id) {
    const models = await getSavedModels();
    const index = models.findIndex(m => m.id === id);
    
    if (index === -1) {
        return { success: false, error: 'Model not found' };
    }
    
    const deleted = models.splice(index, 1)[0];
    await saveModelsToS3(models);
    
    return { success: true, deleted };
}

// Clear all saved models
export async function clearAllModels() {
    await saveModelsToS3([]);
    return { success: true };
}
