// API Configuration for 3D Glasses Model - Frontend Try On
export const API_CONFIG = {
    // Backend API (Local development)
    backendUrl: 'http://localhost:5000',
    
    // Use local backend for development
    proxyUrl: 'http://localhost:5000',
    
    // Endpoint for saved models only
    savedModelsEndpoint: '/saved-models',
    
    timeout: 30000,
    
    // API Keys (optional for local development)
    apiKey: '17d01976f216103a1c3412684258f4bd5d5467b46e5ee4183f597bbc7c440655',
    secretKey: '6677bbde30277eac9a0675d6c31387be6675393cc757e07c0a32048b8a79708f040f8c8d43e3eb7828530083c406dc1e2168a2145c01a5667a51713c10ddb0ea'
};

// Helper function to validate API keys
export function validateApiKeys() {
    if (!API_CONFIG.apiKey || API_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
        console.warn('⚠️ API Key not configured');
        return false;
    }
    if (!API_CONFIG.secretKey || API_CONFIG.secretKey === 'YOUR_SECRET_KEY_HERE') {
        console.warn('⚠️ Secret Key not configured');
        return false;
    }
    return true;
}

// Helper function to get authorization headers
export function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // Add API keys if configured and authentication is enabled
    if (API_CONFIG.apiKey && API_CONFIG.secretKey) {
        headers['X-API-Key'] = API_CONFIG.apiKey;
        headers['X-Secret-Key'] = API_CONFIG.secretKey;
    }
    
    return headers;
}

// Fetch saved glasses models from dashboard API
export async function fetchAllModelsFromAPI() {
    try {
        // Try saved-models endpoint first
        const savedEndpoint = `${API_CONFIG.proxyUrl}${API_CONFIG.savedModelsEndpoint}`;
        console.log('🔄 Fetching saved models from:', savedEndpoint);
        
        let response = await fetch(savedEndpoint, {
            method: 'GET',
            signal: AbortSignal.timeout(API_CONFIG.timeout)
        });

        if (response.ok) {
            const data = await response.json();
            console.log('📦 Saved Models Response:', data);
            
            if (Array.isArray(data) && data.length > 0) {
                const models = data.map(model => ({
                    id: model.id || model._id,
                    name: model.name || model.filename || 'Glasses',
                    url: model.glbUrl || model.modelUrl || model.url || model.signedUrl
                })).filter(m => m.url);
                
                if (models.length > 0) {
                    console.log(`✅ Found ${models.length} saved glasses models`);
                    return models;
                }
            }
        }

        // Fallback: Get all models and filter for glasses only
        console.log('🔄 No saved models, fetching from /models...');
        response = await fetch(`${API_CONFIG.proxyUrl}/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(API_CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const allModels = await response.json();
        console.log('📦 All Models Response:', allModels.length, 'models');
        
        // Filter to only include actual glasses (exclude people, faces, etc.)
        const glassesModels = allModels
            .filter(model => {
                const name = (model.name || '').toLowerCase();
                // Include only glasses-related models
                const isGlasses = name.includes('glasses') || name.includes('spectacle') || 
                                 name.includes('eyewear') || name.includes('frame') ||
                                 name.includes('sunglasses') || name.includes('optical');
                // Exclude people/faces
                const isPerson = name.includes('man') || name.includes('woman') || 
                                name.includes('person') || name.includes('face') ||
                                name.includes('head') || name.includes('portrait');
                return isGlasses && !isPerson;
            })
            .map(model => ({
                name: model.name || 'Glasses',
                url: model.url || model.glbUrl || model.signedUrl
            }))
            .filter(m => m.url);

        console.log(`✅ Found ${glassesModels.length} glasses models (filtered)`);
        
        if (glassesModels.length > 0) {
            return glassesModels;
        }

        throw new Error('No glasses models found');
    } catch (error) {
        console.error('Failed to fetch models:', error);
        throw error;
    }
}

// Fetch single model (for backward compatibility)
export async function fetchModelFromAPI() {
    const models = await fetchAllModelsFromAPI();
    if (models.length > 0) {
        return models[0].url;
    }
    throw new Error('No models found');
}
