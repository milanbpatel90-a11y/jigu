import boto3
import os
from PIL import Image, ImageDraw, ImageFont
import re

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

print("Fetching all GLB models from Wasabi...")

# Get all GLB files from bucket
response = s3.list_objects_v2(Bucket=BUCKET)
glb_files = []

if 'Contents' in response:
    for obj in response['Contents']:
        key = obj['Key']
        if key.lower().endswith('.glb'):
            glb_files.append(key)

print(f"Found {len(glb_files)} GLB models")
print("Generating reference images for all models...")

def create_reference_image(model_name, output_path):
    """Create a simple reference image with model name and glasses icon"""
    # Clean up the name for display
    display_name = os.path.splitext(model_name)[0]
    display_name = re.sub(r'[_\-()]', ' ', display_name)
    display_name = display_name.strip().title()
    
    # Create image
    img = Image.new('RGB', (512, 512), color=(245, 245, 245))
    draw = ImageDraw.Draw(img)
    
    # Draw glasses icon
    # Left lens
    draw.ellipse([120, 200, 220, 280], outline='black', width=4)
    # Right lens
    draw.ellipse([292, 200, 392, 280], outline='black', width=4)
    # Bridge
    draw.line([220, 240, 292, 240], fill='black', width=4)
    # Left temple
    draw.line([120, 240, 60, 230], fill='black', width=4)
    # Right temple
    draw.line([392, 240, 452, 230], fill='black', width=4)
    
    # Add model name (split into multiple lines if too long)
    words = display_name.split()
    lines = []
    current_line = []
    
    for word in words:
        current_line.append(word)
        test_line = ' '.join(current_line)
        if len(test_line) > 30:
            if len(current_line) > 1:
                current_line.pop()
                lines.append(' '.join(current_line))
                current_line = [word]
            else:
                lines.append(test_line)
                current_line = []
    
    if current_line:
        lines.append(' '.join(current_line))
    
    # Draw text lines
    y_start = 340
    for i, line in enumerate(lines[:3]):  # Max 3 lines
        draw.text((256, y_start + i * 30), line, fill='black', anchor='mm')
    
    img.save(output_path)

count = 0
for glb_file in glb_files:
    base_name = os.path.splitext(glb_file)[0]
    # Replace any path separators
    safe_name = base_name.replace('/', '_').replace('\\', '_')
    img_path = os.path.join(REF_DIR, f"{safe_name}.jpg")
    
    # Skip if already exists
    if os.path.exists(img_path):
        print(f"Skipping (exists): {safe_name}.jpg")
        continue
    
    create_reference_image(glb_file, img_path)
    
    # Upload to S3
    s3_key = f"reference_images/{safe_name}.jpg"
    try:
        s3.upload_file(img_path, BUCKET, s3_key)
        count += 1
        if count % 10 == 0:
            print(f"Processed {count}/{len(glb_files)} models...")
    except Exception as e:
        print(f"Failed to upload {s3_key}: {e}")

print(f"\n✓ Generated {count} new reference images")
print(f"✓ Total reference images: {len(os.listdir(REF_DIR))}")
print("\nNow building AI embeddings...")

# Build embeddings
import subprocess
result = subprocess.run(['python', 'match.py', '--build'], capture_output=True, text=True)
print(result.stdout)
if result.returncode != 0:
    print("Error:", result.stderr)
else:
    print("\n✓ AI is ready with all models!")
