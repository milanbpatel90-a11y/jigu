#!/usr/bin/env python3
"""
Generate thumbnail images from GLB models using trimesh and pyrender
"""

import os
import sys
import json
import boto3
from botocore.client import Config

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_ENDPOINT = os.getenv('AWS_ENDPOINT', 's3.eu-west-1.wasabisys.com')
AWS_REGION = os.getenv('AWS_REGION', 'eu-west-1')
S3_BUCKET = os.getenv('S3_BUCKET', 'jigu1')

TEMP_DIR = 'temp_models'
THUMB_DIR = 'reference_images'

# Create directories
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

def get_s3_client():
    """Create S3 client for Wasabi"""
    return boto3.client(
        's3',
        endpoint_url=f'https://{AWS_ENDPOINT}',
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
        region_name=AWS_REGION,
        config=Config(signature_version='s3v4')
    )

def list_glb_models(s3):
    """List all GLB models in the bucket"""
    print("Fetching GLB models from S3...")
    response = s3.list_objects_v2(Bucket=S3_BUCKET, MaxKeys=500)
    
    models = []
    for obj in response.get('Contents', []):
        key = obj['Key']
        if key.lower().endswith('.glb'):
            # Skip person/human models
            if 'man' not in key.lower() and 'woman' not in key.lower() and 'person' not in key.lower():
                models.append(key)
    
    print(f"Found {len(models)} GLB models")
    return models

def list_existing_thumbnails(s3):
    """List existing thumbnails in S3"""
    print("Checking existing thumbnails...")
    try:
        response = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix='reference_images/', MaxKeys=500)
        thumbs = []
        for obj in response.get('Contents', []):
            key = obj['Key']
            if key.lower().endswith(('.jpg', '.jpeg', '.png')):
                base = os.path.splitext(os.path.basename(key))[0]
                thumbs.append(base)
        print(f"Found {len(thumbs)} existing thumbnails")
        return thumbs
    except:
        return []

def download_model(s3, key):
    """Download a GLB model from S3"""
    local_path = os.path.join(TEMP_DIR, os.path.basename(key))
    print(f"  Downloading {key}...")
    s3.download_file(S3_BUCKET, key, local_path)
    return local_path

def upload_thumbnail(s3, local_path, s3_key):
    """Upload thumbnail to S3"""
    print(f"  Uploading to {s3_key}...")
    s3.upload_file(local_path, S3_BUCKET, s3_key, ExtraArgs={'ContentType': 'image/png'})

def render_thumbnail_trimesh(glb_path, output_path):
    """Render thumbnail using trimesh"""
    try:
        import trimesh
        import numpy as np
        from PIL import Image
        
        # Load the GLB file
        scene = trimesh.load(glb_path)
        
        # Get the scene or mesh
        if isinstance(scene, trimesh.Scene):
            # Combine all meshes
            meshes = []
            for name, geom in scene.geometry.items():
                if isinstance(geom, trimesh.Trimesh):
                    meshes.append(geom)
            if meshes:
                mesh = trimesh.util.concatenate(meshes)
            else:
                raise ValueError("No meshes found in scene")
        else:
            mesh = scene
        
        # Try to render using pyrender if available
        try:
            import pyrender
            
            # Create scene
            pr_scene = pyrender.Scene(bg_color=[240, 240, 240, 255])
            
            # Add mesh
            pr_mesh = pyrender.Mesh.from_trimesh(mesh)
            pr_scene.add(pr_mesh)
            
            # Add camera
            camera = pyrender.PerspectiveCamera(yfov=np.pi / 3.0)
            
            # Position camera to see the whole model
            bounds = mesh.bounds
            center = mesh.centroid
            size = np.max(bounds[1] - bounds[0])
            camera_distance = size * 2
            
            camera_pose = np.eye(4)
            camera_pose[:3, 3] = center + [0, 0, camera_distance]
            pr_scene.add(camera, pose=camera_pose)
            
            # Add light
            light = pyrender.DirectionalLight(color=[1.0, 1.0, 1.0], intensity=3.0)
            pr_scene.add(light, pose=camera_pose)
            
            # Render
            renderer = pyrender.OffscreenRenderer(256, 256)
            color, _ = renderer.render(pr_scene)
            renderer.delete()
            
            # Save image
            img = Image.fromarray(color)
            img.save(output_path)
            return True
            
        except ImportError:
            # Fallback: create a simple visualization
            print("  pyrender not available, using simple render...")
            
            # Create a simple top-down view
            bounds = mesh.bounds
            center = mesh.centroid
            
            # Project vertices to 2D
            vertices = mesh.vertices - center
            
            # Simple orthographic projection (front view)
            x = vertices[:, 0]
            y = vertices[:, 1]
            
            # Normalize to image coordinates
            x_min, x_max = x.min(), x.max()
            y_min, y_max = y.min(), y.max()
            
            scale = min(200 / (x_max - x_min + 0.001), 200 / (y_max - y_min + 0.001))
            
            x_img = ((x - x_min) * scale + 28).astype(int)
            y_img = (256 - ((y - y_min) * scale + 28)).astype(int)
            
            # Create image
            img = Image.new('RGB', (256, 256), (240, 240, 240))
            pixels = img.load()
            
            # Draw points
            for xi, yi in zip(x_img, y_img):
                if 0 <= xi < 256 and 0 <= yi < 256:
                    pixels[xi, yi] = (50, 50, 50)
            
            img.save(output_path)
            return True
            
    except Exception as e:
        print(f"  Render error: {e}")
        return False

def create_placeholder_thumbnail(glb_path, output_path):
    """Create a simple placeholder thumbnail"""
    try:
        from PIL import Image, ImageDraw, ImageFont
        
        base_name = os.path.splitext(os.path.basename(glb_path))[0]
        
        # Determine color based on filename
        color = (128, 128, 128)  # default gray
        name_lower = base_name.lower()
        
        if 'black' in name_lower: color = (26, 26, 26)
        elif 'gold' in name_lower or 'yellow' in name_lower: color = (255, 215, 0)
        elif 'silver' in name_lower or 'metal' in name_lower: color = (192, 192, 192)
        elif 'red' in name_lower or 'bloody' in name_lower: color = (220, 20, 60)
        elif 'blue' in name_lower: color = (65, 105, 225)
        elif 'green' in name_lower: color = (34, 139, 34)
        elif 'pink' in name_lower or 'rose' in name_lower: color = (255, 105, 180)
        elif 'white' in name_lower: color = (245, 245, 245)
        elif 'brown' in name_lower: color = (139, 69, 19)
        elif 'orange' in name_lower: color = (255, 140, 0)
        elif 'purple' in name_lower: color = (147, 112, 219)
        elif 'round' in name_lower: color = (100, 100, 100)
        elif 'cat' in name_lower: color = (80, 80, 80)
        elif 'aviator' in name_lower: color = (60, 60, 60)
        
        # Create image
        img = Image.new('RGB', (256, 256), (240, 240, 240))
        draw = ImageDraw.Draw(img)
        
        # Draw glasses shape
        # Left lens
        draw.ellipse([40, 90, 120, 160], outline=color, width=4)
        # Right lens
        draw.ellipse([136, 90, 216, 160], outline=color, width=4)
        # Bridge
        draw.line([120, 125, 136, 125], fill=color, width=3)
        # Left temple
        draw.line([40, 125, 10, 100], fill=color, width=2)
        # Right temple
        draw.line([216, 125, 246, 100], fill=color, width=2)
        
        # Add name
        try:
            font = ImageFont.truetype("arial.ttf", 10)
        except:
            font = ImageFont.load_default()
        
        short_name = base_name[:25] + '...' if len(base_name) > 25 else base_name
        draw.text((128, 200), short_name, fill=(100, 100, 100), anchor="mm", font=font)
        
        img.save(output_path)
        return True
        
    except Exception as e:
        print(f"  Placeholder error: {e}")
        return False

def main():
    print("=== GLB Thumbnail Generator ===\n")
    
    s3 = get_s3_client()
    
    models = list_glb_models(s3)
    existing = list_existing_thumbnails(s3)
    
    # Find models without thumbnails
    to_process = [m for m in models if os.path.splitext(os.path.basename(m))[0] not in existing]
    
    print(f"\nModels needing thumbnails: {len(to_process)}")
    
    if not to_process:
        print("All models have thumbnails!")
        return
    
    # Check if trimesh is available
    try:
        import trimesh
        use_trimesh = True
        print("Using trimesh for rendering")
    except ImportError:
        use_trimesh = False
        print("trimesh not available, using placeholder images")
        print("Install with: pip install trimesh pillow")
    
    processed = 0
    failed = 0
    
    for i, model_key in enumerate(to_process):
        base_name = os.path.splitext(os.path.basename(model_key))[0]
        print(f"\n[{i+1}/{len(to_process)}] {base_name}")
        
        try:
            # Download model
            local_glb = download_model(s3, model_key)
            thumb_path = os.path.join(THUMB_DIR, f"{base_name}.png")
            
            # Render thumbnail
            success = False
            if use_trimesh:
                success = render_thumbnail_trimesh(local_glb, thumb_path)
            
            if not success:
                success = create_placeholder_thumbnail(local_glb, thumb_path)
            
            if success and os.path.exists(thumb_path):
                # Upload to S3
                upload_thumbnail(s3, thumb_path, f"reference_images/{base_name}.png")
                print("  ✅ Success")
                processed += 1
            else:
                print("  ❌ Failed to create thumbnail")
                failed += 1
            
            # Cleanup
            if os.path.exists(local_glb):
                os.remove(local_glb)
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed += 1
    
    print(f"\n=== Summary ===")
    print(f"Processed: {processed + failed}")
    print(f"Success: {processed}")
    print(f"Failed: {failed}")
    
    if processed > 0:
        print("\nBuilding AI embeddings...")
        os.system("python match.py --build")

if __name__ == "__main__":
    main()
