import AWS from "aws-sdk";

const s3 = new AWS.S3({
  endpoint: "s3.eu-west-1.wasabisys.com",
  region: "eu-west-1",
  accessKeyId: "CIRUITZOGBCJ0JVNF24E",
  secretAccessKey: "q7yMsemeGeQ70P4DYzXrmFeuUjb5ms62bucg28ec",
  signatureVersion: "v4"
});

const BUCKET = "jigu";

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "HEAD"],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3000
    }
  ]
};

console.log("Setting CORS configuration for bucket:", BUCKET);

s3.putBucketCors({ Bucket: BUCKET, CORSConfiguration: corsConfig }, (err, data) => {
  if (err) {
    console.error("Failed to set CORS:", err);
  } else {
    console.log("✓ CORS configuration set successfully");
    
    // Verify CORS
    s3.getBucketCors({ Bucket: BUCKET }, (err, data) => {
      if (err) {
        console.error("Failed to get CORS:", err);
      } else {
        console.log("Current CORS configuration:", JSON.stringify(data, null, 2));
      }
    });
  }
});
