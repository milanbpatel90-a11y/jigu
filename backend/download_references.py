import boto3
import os

# Wasabi S3 config
s3 = boto3.client(
    's3',
    endpoint_url='https://s3.eu-west-1.wasabisys.com',
    region_name='eu-west-1',
    aws_access_key_id='CIRUITZOGBCJ0JVNF24E',
    aws_secret_access_key='q7yMsemeGeQ70P4DYzXrmFeuUjb5ms62bucg28ec'
)

BUCKET = 'jigu'
REF_DIR = 'reference_images'

if not os.path.exists(REF_DIR):
    os.makedirs(REF_DIR)

# List all objects in the reference_images folder on S3
try:
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix='reference_images/')
    
    if 'Contents' not in response:
        print("No reference images found in S3 bucket")
    else:
        for obj in response['Contents']:
            key = obj['Key']
            # Skip the folder itself
            if key == 'reference_images/':
                continue
            
            # Get just the filename
            filename = os.path.basename(key)
            local_path = os.path.join(REF_DIR, filename)
            
            print(f"Downloading {key} to {local_path}")
            s3.download_file(BUCKET, key, local_path)
        
        print(f"\nDownloaded {len(response['Contents'])-1} reference images")
except Exception as e:
    print(f"Error: {e}")
