import 'dotenv/config';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

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

async function listGLBModels() {
    console.log('Fetching GLB models from S3...');
    const data = await s3.listObjectsV2({ Bucket: BUCKET, MaxKeys: 1000 }).promise();
    const glbFiles = (data.Contents || [])
        .filter(f => f.Key.toLowerCase().endsWith('.glb'))
        .filter(f => !f.Key.includes('man') && !f.Key.includes('woman') && !f.Key.includes('person'))
        .map(f => f.Key);
    console.log(`Found ${glbFiles.length} GLB models (excluding people models)`);
    return glbFiles;
}

async function checkExistingReferences() {
    console.log('Checking existing reference images...');
    try {
        const data = await s3.listObjectsV2({ 
            Bucket: BUCKET, 
            Prefix: 'reference_images/',
            MaxKeys: 1000 
        }).promise();
        const refs = (data.Contents || [])
            .filter(f => f.Key.match(/\.(jpg|jpeg|png)$/i))
            .map(f => path.basename(f.Key, path.extname(f.Key)));
        console.log(`Found ${refs.length} existing reference images`);
        return refs;
    } catch (e) {
        console.log('No reference_images folder found');
        return [];
    }
}

async function createPlaceholderReference(glbName) {
    // Create a simple placeholder image with the model name
    // This is a temporary solution - ideally you'd render actual thumbnails
    const baseName = path.basename(glbName, '.glb');
    const refName = `reference_images/${baseName}.jpg`;
    
    // Check if we have a local placeholder
    const localPlaceholder = path.join('reference_images', `${baseName}.jpg`);
    if (fs.existsSync(localPlaceholder)) {
        const body = fs.readFileSync(localPlaceholder);
        await s3.upload({
            Bucket: BUCKET,
            Key: refName,
            Body: body,
            ContentType: 'image/jpeg'
        }).promise();
        return true;
    }
    return false;
}

async function downloadGLBAndRender(glbKey) {
    const baseName = path.basename(glbKey, '.glb');
    const localGlb = path.join('temp', `${baseName}.glb`);
    const localImg = path.join('reference_images', `${baseName}.jpg`);
    
    // Create directories
    if (!fs.existsSync('temp')) fs.mkdirSync('temp');
    if (!fs.existsSync('reference_images')) fs.mkdirSync('reference_images');
    
    // Download GLB
    console.log(`  Downloading ${glbKey}...`);
    const data = await s3.getObject({ Bucket: BUCKET, Key: glbKey }).promise();
    fs.writeFileSync(localGlb, data.Body);
    
    return { localGlb, localImg, baseName };
}

async function main() {
    console.log('=== Reference Image Generator ===\n');
    
    const glbModels = await listGLBModels();
    const existingRefs = await checkExistingReferences();
    
    // Find models without references
    const missingRefs = glbModels.filter(glb => {
        const baseName = path.basename(glb, '.glb');
        return !existingRefs.includes(baseName);
    });
    
    console.log(`\nModels needing reference images: ${missingRefs.length}`);
    
    if (missingRefs.length === 0) {
        console.log('All models have reference images!');
        return;
    }
    
    console.log('\nFirst 20 models without references:');
    missingRefs.slice(0, 20).forEach(m => console.log('  -', m));
    
    console.log('\n=== Summary ===');
    console.log(`Total GLB models: ${glbModels.length}`);
    console.log(`Existing references: ${existingRefs.length}`);
    console.log(`Missing references: ${missingRefs.length}`);
    
    console.log('\n💡 To add reference images:');
    console.log('1. Take photos of each glasses style');
    console.log('2. Name them to match GLB files (e.g., cat_eye_glasses.jpg)');
    console.log('3. Upload to Wasabi in reference_images/ folder');
    console.log('4. Run: python match.py --build');
}

main().catch(console.error);
