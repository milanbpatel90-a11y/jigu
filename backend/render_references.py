"""
Render reference images from GLB models using trimesh and pyrender
This will create actual 3D renders instead of placeholder images
"""
import os
import boto3
import trimesh
import pyrender
import numpy as np
from PIL import Image
import tempfile

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

def render_glb_to_image(glb_path, output_path, resolution=(512, 512)):
    """Render a GLB file to an image"""
    try:
        # Load the mesh
        scene = trimesh.load(glb_path)
        
        # Convert to pyrender scene
        if isinstance(scene, trimesh.Scene):
            mesh = trimesh.util.concatenate([
                trimesh.Trimesh(vertices=g.vertices, faces=g.faces)
                for g in scene.geometry.values()
            ])
        else:
            mesh = scene
        
        # Center and scale mesh
        mesh.vertices -= mesh.centroid
        scale = 2.0 / np.max(mesh.extents)
        mesh.vertices *= scale
        
        # Create pyrender scene
        pr_scene = pyrender.Scene(ambient_light=[0.5, 0.5, 0.5])
        pr_mesh = pyrender.Mesh.from_trimesh(mesh, smooth=True)
        pr_scene.add(pr_mesh)
        
        # Add lights
        light = pyrender.DirectionalLight(color=[1.0, 1.0, 1.0], intensity=3.0)
        pr_scene.add(light, pose=np.array([
            [1, 0, 0, 2],
            [0, 1, 0, 2],
            [0, 0, 1, 2],
            [0, 0, 0, 1]
        ]))
        
        # Setup camera
        camera = pyrender.PerspectiveCamera(yfov=np.pi / 3.0)
        camera_pose = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 3],
            [0, 0, 0, 1]
        ])
        pr_scene.add(camera, pose=camera_pose)
        
        # Render
        renderer = pyrender.OffscreenRenderer(*resolution)
        color, depth = renderer.render(pr_scene)
        renderer.delete()
        
        # Save image
        img = Image.fromarray(color)
        img.save(output_path)
        return True
        
    except Exception as e:
        print(f"Error rendering {glb_path}: {e}")
        return False

print("This script requires: pip install trimesh pyrender")
print("Note: pyrender requires OpenGL, which may not work in all environments")
print("\nFor best results, use Option 2 or 3 instead (see below)")
