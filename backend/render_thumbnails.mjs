import 'dotenv/config';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const s3Endpoint = process.env.AWS_ENDPOINT || 's3.eu-west-1.wasabisys.com';
const s3Region = process.env.AWS_REGION || 'eu-west-1';
const BUCKET = process.env.S3_BUCKET || 'jigu1';

const s3 = new AWS.S3({
    endpoint: `https://${s3Endpoint}`,
    region: s3Region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
});

// Create directories
const TEMP_DIR = 'temp_models';
const THUMB_DIR = 'reference_images';

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR);

async function listGLBModels() {
    console.log('Fetching GLB models from S3...');
    const data = await s3.listObjectsV2({ Bucket: BUCKET, MaxKeys: 500 }).promise();
    const glbFiles = (data.Contents || [])
        .filter(f => f.Key.toLowerCase().endsWith('.glb'))
        .filter(f => !f.Key.toLowerCase().includes('man') && !f.Key.toLowerCase().includes('woman') && !f.Key.toLowerCase().includes('person'))
        .map(f => ({ key: f.Key, size: f.Size }));
    console.log(`Found ${glbFiles.length} GLB models`);
    return glbFiles;
}

async function checkExistingThumbnails() {
    console.log('Checking existing thumbnails in S3...');
    try {
        const data = await s3.listObjectsV2({ 
            Bucket: BUCKET, 
            Prefix: 'reference_images/',
            MaxKeys: 500 
        }).promise();
        const thumbs = (data.Contents || [])
            .filter(f => f.Key.match(/\.(jpg|jpeg|png)$/i))
            .map(f => path.basename(f.Key, path.extname(f.Key)));
        console.log(`Found ${thumbs.length} existing thumbnails`);
        return thumbs;
    } catch (e) {
        return [];
    }
}

async function downloadModel(key) {
    const localPath = path.join(TEMP_DIR, path.basename(key));
    console.log(`  Downloading ${key}...`);
    const data = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
    fs.writeFileSync(localPath, data.Body);
    return localPath;
}

async function uploadThumbnail(localPath, s3Key) {
    console.log(`  Uploading thumbnail to ${s3Key}...`);
    const body = fs.readFileSync(localPath);
    await s3.upload({
        Bucket: BUCKET,
        Key: s3Key,
        Body: body,
        ContentType: 'image/png'
    }).promise();
}

async function main() {
    console.log('=== GLB Thumbnail Generator ===\n');
    
    const models = await listGLBModels();
    const existingThumbs = await checkExistingThumbnails();
    
    // Find models without thumbnails
    const modelsToProcess = models.filter(m => {
        const baseName = path.basename(m.key, '.glb');
        return !existingThumbs.includes(baseName);
    });
    
    console.log(`\nModels needing thumbnails: ${modelsToProcess.length}`);
    
    if (modelsToProcess.length === 0) {
        console.log('All models have thumbnails!');
        return;
    }
    
    // Check if we have the renderer
    const rendererPath = path.join(process.cwd(), 'thumbnail_renderer.mjs');
    if (!fs.existsSync(rendererPath)) {
        console.log('\nCreating thumbnail renderer...');
        createRenderer();
    }
    
    console.log('\n--- Processing Models ---\n');
    
    let processed = 0;
    let failed = 0;
    
    for (const model of modelsToProcess) {
        const baseName = path.basename(model.key, '.glb');
        console.log(`[${processed + failed + 1}/${modelsToProcess.length}] ${baseName}`);
        
        try {
            // Download model
            const localGlb = await downloadModel(model.key);
            
            // Render thumbnail using the renderer script
            const thumbPath = path.join(THUMB_DIR, `${baseName}.png`);
            
            try {
                execSync(`node thumbnail_renderer.mjs "${localGlb}" "${thumbPath}"`, {
                    timeout: 60000,
                    stdio: 'pipe'
                });
                
                if (fs.existsSync(thumbPath)) {
                    // Upload to S3
                    await uploadThumbnail(thumbPath, `reference_images/${baseName}.png`);
                    console.log(`  ✅ Success`);
                    processed++;
                } else {
                    console.log(`  ❌ Thumbnail not created`);
                    failed++;
                }
            } catch (renderErr) {
                console.log(`  ❌ Render failed: ${renderErr.message}`);
                failed++;
            }
            
            // Cleanup
            if (fs.existsSync(localGlb)) fs.unlinkSync(localGlb);
            
        } catch (err) {
            console.log(`  ❌ Error: ${err.message}`);
            failed++;
        }
        
        // Progress update every 10 models
        if ((processed + failed) % 10 === 0) {
            console.log(`\n--- Progress: ${processed} success, ${failed} failed ---\n`);
        }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total processed: ${processed + failed}`);
    console.log(`Successful: ${processed}`);
    console.log(`Failed: ${failed}`);
    
    // Build embeddings if we have new thumbnails
    if (processed > 0) {
        console.log('\nBuilding AI embeddings...');
        try {
            execSync('python match.py --build', { stdio: 'inherit' });
            console.log('✅ Embeddings built successfully!');
        } catch (e) {
            console.log('⚠️ Could not build embeddings automatically. Run: python match.py --build');
        }
    }
}

function createRenderer() {
    const rendererCode = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

// Headless rendering requires node-canvas or similar
// For now, we'll create a simple placeholder

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node thumbnail_renderer.mjs <input.glb> <output.png>');
    process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];

// Since we can't do headless WebGL easily in Node.js,
// we'll create a colored placeholder based on the filename
const baseName = path.basename(inputPath, '.glb').toLowerCase();

// Determine color based on filename
let color = '#808080'; // default gray
if (baseName.includes('black')) color = '#1a1a1a';
else if (baseName.includes('gold') || baseName.includes('yellow')) color = '#ffd700';
else if (baseName.includes('silver') || baseName.includes('metal')) color = '#c0c0c0';
else if (baseName.includes('red') || baseName.includes('bloody')) color = '#dc143c';
else if (baseName.includes('blue')) color = '#4169e1';
else if (baseName.includes('green')) color = '#228b22';
else if (baseName.includes('pink') || baseName.includes('rose')) color = '#ff69b4';
else if (baseName.includes('white')) color = '#f5f5f5';
else if (baseName.includes('brown')) color = '#8b4513';
else if (baseName.includes('orange')) color = '#ff8c00';
else if (baseName.includes('purple')) color = '#9370db';

// Create a simple SVG placeholder
const svg = \`<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" fill="#f0f0f0"/>
  <text x="128" y="128" text-anchor="middle" font-family="Arial" font-size="12" fill="\${color}">
    \${path.basename(inputPath, '.glb').substring(0, 20)}
  </text>
  <ellipse cx="80" cy="120" rx="40" ry="30" fill="none" stroke="\${color}" stroke-width="3"/>
  <ellipse cx="176" cy="120" rx="40" ry="30" fill="none" stroke="\${color}" stroke-width="3"/>
  <line x1="120" y1="120" x2="136" y2="120" stroke="\${color}" stroke-width="3"/>
  <line x1="40" y1="120" x2="20" y2="100" stroke="\${color}" stroke-width="2"/>
  <line x1="216" y1="120" x2="236" y2="100" stroke="\${color}" stroke-width="2"/>
</svg>\`;

// For now, just write a marker file - we need a proper renderer
fs.writeFileSync(outputPath.replace('.png', '.svg'), svg);
console.log('Created SVG placeholder (PNG rendering requires additional setup)');
process.exit(0);
`;
    
    fs.writeFileSync('thumbnail_renderer.mjs', rendererCode);
}

main().catch(console.error);
