import boto3
import os
from PIL import Image, ImageDraw, ImageFont

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

# Select a few test models
test_models = [
    'cat_eye_glasses.glb',
    'ray_ban_glasses.glb',
    'nerd_glasses.glb',
    'heart_glasses.glb',
    'sun_glasses.glb'
]

print("Creating test reference images...")

for model_name in test_models:
    # Create a simple placeholder image with the model name
    base_name = os.path.splitext(model_name)[0]
    img_path = os.path.join(REF_DIR, f"{base_name}.jpg")
    
    # Create a 512x512 image with text
    img = Image.new('RGB', (512, 512), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    
    # Draw some simple shapes to represent glasses
    # Frame
    draw.rectangle([100, 200, 220, 280], outline='black', width=3)
    draw.rectangle([292, 200, 412, 280], outline='black', width=3)
    # Bridge
    draw.line([220, 240, 292, 240], fill='black', width=3)
    # Temples
    draw.line([100, 240, 50, 240], fill='black', width=3)
    draw.line([412, 240, 462, 240], fill='black', width=3)
    
    # Add text
    text = base_name.replace('_', ' ').title()
    # Use default font
    draw.text((256, 350), text, fill='black', anchor='mm')
    
    img.save(img_path)
    print(f"Created: {img_path}")
    
    # Upload to S3 in reference_images folder
    s3_key = f"reference_images/{base_name}.jpg"
    try:
        s3.upload_file(img_path, BUCKET, s3_key)
        print(f"Uploaded to S3: {s3_key}")
    except Exception as e:
        print(f"Failed to upload {s3_key}: {e}")

print(f"\nCreated {len(test_models)} test reference images")
print("Now run: python match.py --build")
