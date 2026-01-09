import 'dotenv/config';
import AWS from 'aws-sdk';

console.log('=== Wasabi Connection Test ===\n');

// Show current configuration
console.log('Configuration:');
console.log('  Access Key ID:', process.env.AWS_ACCESS_KEY_ID || 'NOT SET');
console.log('  Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? '***SET***' : 'NOT SET');
console.log('  Endpoint:', process.env.AWS_ENDPOINT || 's3.eu-west-1.wasabisys.com');
console.log('  Region:', process.env.AWS_REGION || 'eu-west-1');
console.log('  Bucket:', process.env.S3_BUCKET || 'jigu1');
console.log('');

const s3Endpoint = process.env.AWS_ENDPOINT || 's3.eu-west-1.wasabisys.com';
const s3Region = process.env.AWS_REGION || 'eu-west-1';
const BUCKET = process.env.S3_BUCKET || 'jigu1';

// Create S3 client
const s3 = new AWS.S3({
    endpoint: `https://${s3Endpoint}`,
    region: s3Region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
});

// Test 1: List buckets
console.log('Test 1: Listing all buckets...');
try {
    const buckets = await s3.listBuckets().promise();
    console.log('  ✅ SUCCESS! Found', buckets.Buckets.length, 'buckets:');
    buckets.Buckets.forEach(b => console.log('    -', b.Name));
} catch (err) {
    console.log('  ❌ FAILED:', err.code, '-', err.message);
}
console.log('');

// Test 2: List objects in bucket
console.log(`Test 2: Listing objects in bucket "${BUCKET}"...`);
try {
    const data = await s3.listObjectsV2({ Bucket: BUCKET, MaxKeys: 200 }).promise();
    const allObjects = data.Contents || [];
    const glbFiles = allObjects.filter(f => f.Key.toLowerCase().endsWith('.glb'));
    const imageFiles = allObjects.filter(f => 
        f.Key.toLowerCase().endsWith('.jpg') || 
        f.Key.toLowerCase().endsWith('.png') ||
        f.Key.toLowerCase().endsWith('.jpeg')
    );
    
    console.log('  ✅ SUCCESS!');
    console.log(`  Total objects: ${allObjects.length}`);
    console.log(`  GLB models: ${glbFiles.length}`);
    console.log(`  Images: ${imageFiles.length}`);
    console.log('');
    console.log('  First 10 GLB models:');
    glbFiles.slice(0, 10).forEach(obj => {
        console.log('    -', obj.Key, `(${Math.round(obj.Size/1024)}KB)`);
    });
    if (glbFiles.length > 10) {
        console.log('    ... and', glbFiles.length - 10, 'more GLB files');
    }
} catch (err) {
    console.log('  ❌ FAILED:', err.code, '-', err.message);
}
console.log('');

// Test 3: Check if bucket exists
console.log(`Test 3: Checking if bucket "${BUCKET}" exists...`);
try {
    await s3.headBucket({ Bucket: BUCKET }).promise();
    console.log('  ✅ Bucket exists and is accessible');
} catch (err) {
    console.log('  ❌ FAILED:', err.code, '-', err.message);
    if (err.code === 'NotFound') {
        console.log('  💡 The bucket does not exist. Create it in Wasabi console.');
    } else if (err.code === 'Forbidden' || err.code === 'AccessDenied') {
        console.log('  💡 Access denied. Check bucket permissions or access key.');
    }
}
console.log('');

console.log('=== Test Complete ===');
