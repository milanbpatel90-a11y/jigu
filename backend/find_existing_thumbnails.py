import boto3
import os

s3 = boto3.client(
    's3',
    endpoint_url='https://s3.eu-west-1.wasabisys.com',
    region_name='eu-west-1',
    aws_access_key_id='CIRUITZOGBCJ0JVNF24E',
    aws_secret_access_key='q7yMsemeGeQ70P4DYzXrmFeuUjb5ms62bucg28ec'
)

BUCKET = 'jigu'
REF_DIR = 'reference_images'

print("Searching for image files in bucket...")

response = s3.list_objects_v2(Bucket=BUCKET)

if 'Contents' not in response:
    print("Bucket is empty")
    exit()

# Find all image files
image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
images = []
glb_files = []

for obj in response['Contents']:
    key = obj['Key']
    ext = os.path.splitext(key.lower())[1]
    
    if ext in image_extensions:
        images.append(key)
    elif ext == '.glb':
        glb_files.append(key)

print(f"\nFound {len(glb_files)} GLB models")
print(f"Found {len(images)} image files")

if images:
    print("\nImage files found:")
    for img in images[:20]:  # Show first 20
        print(f"  - {img}")
    if len(images) > 20:
        print(f"  ... and {len(images) - 20} more")
    
    print("\n✓ You can download these images to use as reference images!")
    print("Run: python download_existing_images.py")
else:
    print("\n✗ No image files found in bucket")
    print("You'll need to:")
    print("1. Upload photos of each glasses model, OR")
    print("2. Use a 3D rendering tool to create images from GLB files")
