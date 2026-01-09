#!/usr/bin/env python3
"""
CLIP AI matching for 3D glasses models with color/material extraction
"""

import sys
import os
import json
import time
import colorsys

REF_DIR = "reference_images"
EMBEDDINGS_FILE = "reference_embeddings.pt"

# Available models in Wasabi (will be populated from S3)
AVAILABLE_MODELS = []

# Shape keywords for matching
SHAPE_KEYWORDS = {
    'round': ['round', 'circular', 'circle', 'oval', 'metal_round', 'lennon', 'vintage', 'retro', 'classic'],
    'square': ['square', 'rectangular', 'rectangle', 'box', 'wayfarer', 'nerd', 'hipster'],
    'cat_eye': ['cat_eye', 'cat-eye', 'cateye', 'cat'],
    'aviator': ['aviator', 'pilot', 'teardrop', 'ray_ban', 'rayban'],
    'wayfarer': ['wayfarer', 'classic', 'black_glasses'],
    'oversized': ['oversized', 'big', 'large', 'xl'],
    'rimless': ['rimless', 'frameless', 'minimal'],
    'sport': ['sport', 'athletic', 'wrap', 'shield', 'oakley'],
    'vintage': ['vintage', 'retro', 'old', 'prada'],
    'futuristic': ['futuristic', 'modern', 'cyber', 'tech', 'vr'],
    'heart': ['heart', 'love'],
    'geometric': ['geometric', 'hexagon', 'octagon', 'polygon'],
}

def set_available_models(models):
    """Set the list of available models from S3"""
    global AVAILABLE_MODELS
    AVAILABLE_MODELS = models


def remove_background(image):
    """Remove background from glasses image to improve matching"""
    try:
        import numpy as np
        from PIL import Image
        
        img_array = np.array(image)
        
        # Convert to grayscale for edge detection
        if len(img_array.shape) == 3:
            gray = np.mean(img_array, axis=2)
        else:
            gray = img_array
        
        # Simple background removal: keep pixels that are not too bright (background is usually white/light)
        # and not too uniform
        height, width = gray.shape
        
        # Calculate local variance to find edges/details
        from scipy import ndimage
        variance = ndimage.generic_filter(gray, np.var, size=5)
        
        # Create mask: keep areas with high variance (edges, details) or darker areas
        mask = (variance > 100) | (gray < 200)
        
        # Dilate mask to include nearby pixels
        mask = ndimage.binary_dilation(mask, iterations=3)
        
        # Apply mask - set background to white
        result = img_array.copy()
        if len(result.shape) == 3:
            for c in range(3):
                result[:, :, c] = np.where(mask, result[:, :, c], 255)
        
        return Image.fromarray(result.astype(np.uint8))
    except ImportError:
        # scipy not available, return original
        return image
    except Exception as e:
        print(f"Background removal failed: {e}", file=sys.stderr)
        return image


def analyze_frame_shape(image):
    """Analyze the frame shape from an image - returns shape characteristics"""
    try:
        import numpy as np
        from PIL import Image
        
        img = image.convert('L')  # Grayscale
        img = img.resize((100, 100))
        pixels = np.array(img)
        
        # Find edges using simple gradient
        gx = np.abs(np.diff(pixels.astype(float), axis=1))
        gy = np.abs(np.diff(pixels.astype(float), axis=0))
        
        # Threshold to get edge pixels
        threshold = 30
        edge_x = gx > threshold
        edge_y = gy > threshold
        
        # Analyze shape: rectangular vs round
        # Rectangular frames have more horizontal/vertical edges
        # Round frames have more diagonal edges
        
        # Count edge distribution
        h, w = pixels.shape
        center_y, center_x = h // 2, w // 2
        
        # Check if edges are more concentrated at corners (rectangular) or distributed (round)
        top_edges = np.sum(edge_y[:h//3, :])
        bottom_edges = np.sum(edge_y[2*h//3:, :])
        left_edges = np.sum(edge_x[:, :w//3])
        right_edges = np.sum(edge_x[:, 2*w//3:])
        
        horizontal_score = top_edges + bottom_edges
        vertical_score = left_edges + right_edges
        
        # Aspect ratio of the glasses region
        # Find bounding box of dark pixels (frame)
        dark_mask = pixels < 100
        if np.any(dark_mask):
            rows = np.any(dark_mask, axis=1)
            cols = np.any(dark_mask, axis=0)
            if np.any(rows) and np.any(cols):
                rmin, rmax = np.where(rows)[0][[0, -1]]
                cmin, cmax = np.where(cols)[0][[0, -1]]
                height = rmax - rmin
                width = cmax - cmin
                aspect_ratio = width / max(height, 1)
            else:
                aspect_ratio = 1.5
        else:
            aspect_ratio = 1.5
        
        # Determine shape type
        # Rectangular: aspect_ratio > 1.8, more horizontal edges
        # Round: aspect_ratio < 1.5, edges more evenly distributed
        # Wayfarer: aspect_ratio 1.5-2.0, strong horizontal edges
        
        is_rectangular = aspect_ratio > 1.6 and horizontal_score > vertical_score * 0.8
        is_round = aspect_ratio < 1.4
        
        return {
            "aspect_ratio": round(aspect_ratio, 2),
            "is_rectangular": is_rectangular,
            "is_round": is_round,
            "horizontal_score": int(horizontal_score),
            "vertical_score": int(vertical_score)
        }
    except Exception as e:
        print(f"Shape analysis failed: {e}", file=sys.stderr)
        return {"aspect_ratio": 1.5, "is_rectangular": False, "is_round": False}


def list_refs():
    if not os.path.isdir(REF_DIR):
        return []
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    return sorted(
        [f for f in os.listdir(REF_DIR) if os.path.splitext(f.lower())[1] in exts]
    )


def extract_glasses_properties(image_paths):
    """Extract lens color, frame color, material type from uploaded images"""
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return {"lensColor": "#3b82f6", "frameColor": "#1a1a1a", "tintOpacity": 0.5, "frameScale": 1.0, "frameMaterial": "plastic", "frameMetalness": 0.1}
    
    all_lens_colors = []
    all_frame_colors = []
    all_frame_pixels = []
    
    for img_path in image_paths:
        try:
            img = Image.open(img_path).convert('RGB')
            width, height = img.size
            
            # Resize for faster processing
            img_small = img.resize((100, 100))
            pixels = np.array(img_small)
            pixels_flat = pixels.reshape(-1, 3)
            
            brightness = np.mean(pixels_flat, axis=1)
            
            # Frame colors: darker pixels
            dark_mask = (brightness > 10) & (brightness < 100)
            dark_pixels = pixels_flat[dark_mask]
            
            if len(dark_pixels) > 10:
                frame_color = np.median(dark_pixels, axis=0).astype(int)
                all_frame_colors.append(frame_color)
                all_frame_pixels.extend(dark_pixels.tolist())
            
            # Lens colors from center region
            center_crop = img.crop((width//4, height//4, 3*width//4, 3*height//4))
            center_crop = center_crop.resize((50, 50))
            center_pixels = np.array(center_crop).reshape(-1, 3)
            center_brightness = np.mean(center_pixels, axis=1)
            
            tint_mask = (center_brightness > 30) & (center_brightness < 200)
            tint_pixels = center_pixels[tint_mask]
            
            if len(tint_pixels) > 5:
                lens_color = np.mean(tint_pixels, axis=0).astype(int)
                all_lens_colors.append(lens_color)
                
        except Exception as e:
            print(f"Error processing {img_path}: {e}", file=sys.stderr)
            continue
    
    # Detect frame material
    frame_pixels_array = np.array(all_frame_pixels) if all_frame_pixels else np.array([[50, 50, 50]])
    
    # Metal detection: low color variance but high brightness variance
    if len(frame_pixels_array) > 10:
        color_std = np.std(frame_pixels_array, axis=0)
        avg_std = np.mean(color_std)
        brightness = np.mean(frame_pixels_array, axis=1)
        brightness_std = np.std(brightness)
        
        avg_color = np.mean(frame_pixels_array, axis=0)
        r, g, b = avg_color
        
        # Silver/chrome: high brightness, low saturation
        is_silver = brightness.mean() > 150 and np.std([r, g, b]) < 20
        is_gold = r > g > b and brightness_std > 30
        
        if is_silver or is_gold or (avg_std < 25 and brightness_std > 40):
            frame_material = "metal"
            metalness = 0.7 if is_silver else 0.5
        else:
            frame_material = "plastic"
            metalness = 0.1
    else:
        frame_material = "plastic"
        metalness = 0.1
    
    # Calculate final frame color
    if all_frame_colors:
        final_frame = np.mean(all_frame_colors, axis=0).astype(int)
        r, g, b = int(final_frame[0]), int(final_frame[1]), int(final_frame[2])
        frame_color = f"#{r:02x}{g:02x}{b:02x}"
    else:
        frame_color = "#1a1a1a"
    
    # Calculate final lens color
    if all_lens_colors:
        final_lens = np.mean(all_lens_colors, axis=0).astype(int)
        r, g, b = int(final_lens[0]), int(final_lens[1]), int(final_lens[2])
        lens_color = f"#{r:02x}{g:02x}{b:02x}"
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        tint_opacity = min(0.85, max(0.25, s * 0.5 + 0.3))
    else:
        lens_color = "#3b82f6"
        tint_opacity = 0.5
    
    return {
        "lensColor": lens_color,
        "frameColor": frame_color,
        "tintOpacity": round(tint_opacity, 2),
        "frameScale": 1.0,
        "frameMaterial": frame_material,
        "frameMetalness": round(metalness, 2)
    }


def simple_match(image_paths=None):
    refs = list_refs()
    
    # Extract properties if images provided
    properties = extract_glasses_properties(image_paths) if image_paths else {
        "lensColor": "#3b82f6", "frameColor": "#1a1a1a", "tintOpacity": 0.5,
        "frameScale": 1.0, "frameMaterial": "plastic", "frameMetalness": 0.1
    }
    
    print(f"simple_match called with {len(image_paths) if image_paths else 0} images", file=sys.stderr)
    
    # Try shape-based matching if we have images
    if image_paths and len(image_paths) > 0:
        print("Attempting shape-based matching...", file=sys.stderr)
        shape_result = match_by_shape(image_paths, properties)
        if shape_result:
            print(f"Shape match found: {shape_result.get('best_model')}", file=sys.stderr)
            return shape_result
        else:
            print("Shape matching returned None", file=sys.stderr)
    
    if refs:
        base = os.path.splitext(refs[0])[0]
        return {
            "best_model": base + ".glb",
            "confidence": 0.6,
            "source_image": refs[0],
            "matched": True,
            "method": "fallback",
            **properties
        }
    return {
        "best_model": "default.glb",
        "confidence": 0.5,
        "source_image": "none",
        "matched": True,
        "method": "default",
        **properties
    }


def detect_glasses_shape(image_paths):
    """Detect the shape of glasses from uploaded images"""
    try:
        from PIL import Image
        import numpy as np
        
        shapes_detected = []
        
        for img_path in image_paths:
            img = Image.open(img_path).convert('L')  # Grayscale
            img = img.resize((200, 200))
            pixels = np.array(img)
            
            # Find the glasses region (darker pixels)
            # Use adaptive threshold based on image
            mean_val = np.mean(pixels)
            threshold = min(mean_val * 0.8, 180)
            dark_mask = pixels < threshold
            
            if not np.any(dark_mask):
                print(f"  No dark pixels found in {img_path}", file=sys.stderr)
                continue
            
            # Find bounding box
            rows = np.any(dark_mask, axis=1)
            cols = np.any(dark_mask, axis=0)
            
            if not np.any(rows) or not np.any(cols):
                continue
                
            rmin, rmax = np.where(rows)[0][[0, -1]]
            cmin, cmax = np.where(cols)[0][[0, -1]]
            
            height = rmax - rmin
            width = cmax - cmin
            
            if height == 0 or width == 0:
                continue
            
            aspect_ratio = width / height
            print(f"  Image aspect ratio: {aspect_ratio:.2f}", file=sys.stderr)
            
            # Extract the glasses region
            region = dark_mask[rmin:rmax, cmin:cmax]
            
            # Calculate fill ratio (how much of bounding box is filled)
            total_pixels = region.size
            dark_pixels = np.sum(region)
            fill_ratio = dark_pixels / total_pixels if total_pixels > 0 else 0
            print(f"  Fill ratio: {fill_ratio:.2f}", file=sys.stderr)
            
            # Calculate circularity - round glasses have high circularity
            # Check if the shape is more circular by looking at the corners
            h, w = region.shape
            if h > 10 and w > 10:
                # Check corners - round glasses have less fill in corners
                corner_size = min(h, w) // 4
                corners = [
                    region[:corner_size, :corner_size],  # top-left
                    region[:corner_size, -corner_size:],  # top-right
                    region[-corner_size:, :corner_size],  # bottom-left
                    region[-corner_size:, -corner_size:]  # bottom-right
                ]
                corner_fill = np.mean([np.mean(c) for c in corners])
                center_region = region[h//4:3*h//4, w//4:3*w//4]
                center_fill = np.mean(center_region) if center_region.size > 0 else 0
                
                circularity = center_fill / (corner_fill + 0.01)  # Higher = more round
                print(f"  Circularity score: {circularity:.2f}", file=sys.stderr)
            else:
                circularity = 1.0
            
            # Detect shape type based on multiple factors
            # Round glasses: aspect ratio close to 1, high circularity, lower corner fill
            if circularity > 1.5 or (aspect_ratio < 1.5 and fill_ratio < 0.5):
                shapes_detected.append('round')
                print(f"  -> Detected as ROUND", file=sys.stderr)
            elif aspect_ratio > 2.5:
                shapes_detected.append('aviator')
                print(f"  -> Detected as AVIATOR", file=sys.stderr)
            elif aspect_ratio > 1.8:
                if fill_ratio > 0.6:
                    shapes_detected.append('wayfarer')
                    print(f"  -> Detected as WAYFARER", file=sys.stderr)
                else:
                    shapes_detected.append('sport')
                    print(f"  -> Detected as SPORT", file=sys.stderr)
            elif aspect_ratio > 1.3:
                if fill_ratio > 0.7:
                    shapes_detected.append('square')
                    print(f"  -> Detected as SQUARE", file=sys.stderr)
                else:
                    shapes_detected.append('cat_eye')
                    print(f"  -> Detected as CAT_EYE", file=sys.stderr)
            else:
                if fill_ratio > 0.75:
                    shapes_detected.append('round')
                    print(f"  -> Detected as ROUND (high fill)", file=sys.stderr)
                else:
                    shapes_detected.append('round')  # Default to round for ambiguous cases
                    print(f"  -> Detected as ROUND (default)", file=sys.stderr)
        
        # Return most common shape
        if shapes_detected:
            from collections import Counter
            result = Counter(shapes_detected).most_common(1)[0][0]
            print(f"Final shape decision: {result} (from {shapes_detected})", file=sys.stderr)
            return result
        
        return 'round'  # Default to round instead of classic
        
    except Exception as e:
        print(f"Shape detection error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 'round'  # Default to round


def match_by_shape(image_paths, properties):
    """Match uploaded images to a model based on detected shape"""
    try:
        # Detect shape from uploaded images
        detected_shape = detect_glasses_shape(image_paths)
        print(f"Detected shape: {detected_shape}", file=sys.stderr)
        
        # Get available models (passed from Node.js or read from file)
        models = AVAILABLE_MODELS if AVAILABLE_MODELS else get_models_from_file()
        
        print(f"Available models: {len(models)}", file=sys.stderr)
        
        if not models:
            print("No models available for matching", file=sys.stderr)
            return None
        
        # Find models matching the detected shape
        shape_keywords = SHAPE_KEYWORDS.get(detected_shape, [detected_shape])
        print(f"Looking for keywords: {shape_keywords}", file=sys.stderr)
        
        matching_models = []
        for model in models:
            model_lower = model.lower()
            for keyword in shape_keywords:
                if keyword in model_lower:
                    matching_models.append(model)
                    print(f"  Found match: {model} (keyword: {keyword})", file=sys.stderr)
                    break
        
        print(f"Found {len(matching_models)} matching models", file=sys.stderr)
        
        # If no shape match, try to find any glasses model
        if not matching_models:
            print("No shape matches, using generic glasses models", file=sys.stderr)
            # Filter out non-glasses models
            glasses_models = [m for m in models if 'glasses' in m.lower() or 'spectacle' in m.lower() or 'eyewear' in m.lower()]
            if glasses_models:
                matching_models = glasses_models[:10]  # Take first 10
            else:
                matching_models = models[:10]
        
        # Pick the best match (first one for now)
        best_model = matching_models[0] if matching_models else models[0]
        print(f"Selected model: {best_model}", file=sys.stderr)
        
        return {
            "best_model": best_model,
            "confidence": 0.75 if detected_shape != 'classic' else 0.5,
            "source_image": "shape_detection",
            "matched": True,
            "method": "shape_match",
            "detected_shape": detected_shape,
            **properties
        }
        
    except Exception as e:
        print(f"Shape matching error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None


def get_models_from_file():
    """Read available models from a cache file"""
    try:
        cache_file = "models_cache.json"
        if os.path.exists(cache_file):
            with open(cache_file, 'r') as f:
                return json.load(f)
    except:
        pass
    return []


def load_clip():
    try:
        import torch
        from transformers import CLIPProcessor, CLIPModel
        from PIL import Image

        device = "cpu"
        
        # Try to load model with safetensors to avoid torch.load vulnerability
        try:
            model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32", use_safetensors=True).to(device)
        except Exception as e:
            print(f"Safetensors load failed, trying default: {e}", file=sys.stderr)
            model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
            
        processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        return torch, model, processor, device, Image
    except ImportError as e:
        print(f"Import error: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"CLIP load error: {e}", file=sys.stderr)
        return None


def validate_glasses_image(image_paths):
    """
    Validate that uploaded images are actually glasses/eyewear.
    Returns (is_valid, confidence, rejection_reason)
    """
    loaded = load_clip()
    if not loaded:
        # If CLIP not available, allow the image (fail open)
        print("CLIP not available for validation, allowing image", file=sys.stderr)
        return True, 1.0, None
    
    torch, model, processor, device, Image = loaded
    
    # Define text prompts for classification
    glasses_prompts = [
        "a photo of eyeglasses",
        "a photo of sunglasses", 
        "a photo of spectacles",
        "a photo of reading glasses",
        "a photo of prescription glasses",
        "a photo of eyewear",
        "a photo of optical frames"
    ]
    
    non_glasses_prompts = [
        "a photo of a person",
        "a photo of a face",
        "a photo of food",
        "a photo of an animal",
        "a photo of a cat",
        "a photo of a dog",
        "a photo of a phone",
        "a photo of a car",
        "a photo of a building",
        "a photo of nature",
        "a photo of clothing",
        "a photo of shoes",
        "a photo of a watch",
        "a photo of text or document",
        "a photo of furniture",
        "a photo of electronics"
    ]
    
    all_prompts = glasses_prompts + non_glasses_prompts
    
    try:
        # Process all images
        images = []
        for path in image_paths:
            try:
                img = Image.open(path).convert("RGB")
                images.append(img)
            except Exception as e:
                print(f"Error loading image {path}: {e}", file=sys.stderr)
                continue
        
        if not images:
            return False, 0.0, "Could not load any images"
        
        # Check each image
        glasses_scores = []
        non_glasses_scores = []
        
        with torch.no_grad():
            for img in images:
                # Process image and text
                inputs = processor(
                    text=all_prompts,
                    images=img,
                    return_tensors="pt",
                    padding=True
                ).to(device)
                
                outputs = model(**inputs)
                logits_per_image = outputs.logits_per_image
                probs = logits_per_image.softmax(dim=1).squeeze()
                
                # Sum probabilities for glasses and non-glasses categories
                glasses_prob = sum(probs[i].item() for i in range(len(glasses_prompts)))
                non_glasses_prob = sum(probs[i].item() for i in range(len(glasses_prompts), len(all_prompts)))
                
                glasses_scores.append(glasses_prob)
                non_glasses_scores.append(non_glasses_prob)
                
                print(f"Image validation - Glasses prob: {glasses_prob:.3f}, Non-glasses prob: {non_glasses_prob:.3f}", file=sys.stderr)
        
        # Average scores across all images
        avg_glasses_score = sum(glasses_scores) / len(glasses_scores)
        avg_non_glasses_score = sum(non_glasses_scores) / len(non_glasses_scores)
        
        # Decision threshold
        # Image is valid if glasses score is higher than non-glasses score
        # and glasses score is above a minimum threshold
        MIN_GLASSES_THRESHOLD = 0.25  # At least 25% probability of being glasses
        
        is_valid = avg_glasses_score > avg_non_glasses_score and avg_glasses_score >= MIN_GLASSES_THRESHOLD
        confidence = avg_glasses_score
        
        if not is_valid:
            if avg_glasses_score < MIN_GLASSES_THRESHOLD:
                rejection_reason = f"Image does not appear to be eyeglasses (confidence: {avg_glasses_score:.1%})"
            else:
                rejection_reason = f"Image appears to be something other than glasses (glasses: {avg_glasses_score:.1%}, other: {avg_non_glasses_score:.1%})"
        else:
            rejection_reason = None
        
        print(f"Validation result: valid={is_valid}, confidence={confidence:.3f}", file=sys.stderr)
        return is_valid, confidence, rejection_reason
        
    except Exception as e:
        print(f"Error during image validation: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        # Fail open - allow the image if validation crashes
        return True, 1.0, None


def build_embeddings():
    print("Building embeddings...", file=sys.stderr)
    loaded = load_clip()
    if not loaded:
        return False

    torch, model, processor, device, Image = loaded
    refs = list_refs()
    if not refs:
        print("No reference images found", file=sys.stderr)
        return False

    ref_paths = [os.path.join(REF_DIR, f) for f in refs]
    print(f"Processing {len(ref_paths)} images...", file=sys.stderr)

    try:
        ref_imgs = [Image.open(p).convert("RGB") for p in ref_paths]

        with torch.no_grad():
            ref_inputs = processor(
                images=ref_imgs, return_tensors="pt", padding=True
            ).to(device)
            ref_feats = model.get_image_features(**ref_inputs)
            ref_feats = ref_feats / ref_feats.norm(p=2, dim=-1, keepdim=True)

        torch.save({"features": ref_feats, "filenames": refs}, EMBEDDINGS_FILE)

        print(f"Saved embeddings to {EMBEDDINGS_FILE}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"Error building embeddings: {e}", file=sys.stderr)
        return False


def clip_match(image_paths):
    # First, validate that images are actually glasses
    is_valid, validation_confidence, rejection_reason = validate_glasses_image(image_paths)
    if not is_valid:
        print(f"Image validation failed: {rejection_reason}", file=sys.stderr)
        return {
            "error": rejection_reason,
            "matched": False,
            "method": "validation_rejected",
            "validation_confidence": round(validation_confidence, 3)
        }
    
    # Try to load embeddings first
    loaded = load_clip()
    if not loaded:
        return simple_match(image_paths)

    torch, model, processor, device, Image = loaded

    ref_feats = None
    ref_filenames = []

    if os.path.exists(EMBEDDINGS_FILE):
        try:
            print(
                f"Loading cached embeddings from {EMBEDDINGS_FILE}...", file=sys.stderr
            )
            data = torch.load(EMBEDDINGS_FILE, weights_only=False)
            ref_feats = data["features"]
            ref_filenames = data["filenames"]
        except Exception as e:
            print(f"Failed to load embeddings: {e}", file=sys.stderr)

    # If no embeddings or load failed, rebuild them (or fallback if too many)
    if ref_feats is None:
        print("No cached embeddings found. Using fallback/slow mode.", file=sys.stderr)
        # For now, just fail back to simple match to avoid OOM if we haven't built them
        # Alternatively, we could build them on the fly, but that risks OOM again.
        # Let's try to build them if there are few images, otherwise warn.
        refs = list_refs()
        if len(refs) > 50:
            print(
                "Too many images to process on-the-fly. Please run --build first.",
                file=sys.stderr,
            )
            return simple_match(image_paths)

        # Small enough to process on the fly?
        # Re-use the logic from original script if needed, but for now let's stick to the plan:
        # We really want to use the cache.
        return simple_match(image_paths)

    try:
        # Encode uploaded images with background removal
        print(f"Processing {len(image_paths)} uploaded images with background removal...", file=sys.stderr)
        up_imgs = []
        for p in image_paths:
            img = Image.open(p).convert("RGB")
            # Remove background for better matching
            img_clean = remove_background(img)
            up_imgs.append(img_clean)

        with torch.no_grad():
            up_inputs = processor(images=up_imgs, return_tensors="pt", padding=True).to(
                device
            )
            up_feats = model.get_image_features(**up_inputs)
            up_feats = up_feats / up_feats.norm(p=2, dim=-1, keepdim=True)

        # Find best match
        mean_feat = up_feats.mean(dim=0, keepdim=True)
        mean_feat = mean_feat / mean_feat.norm(p=2, dim=-1, keepdim=True)

        sims = (mean_feat @ ref_feats.T).squeeze(0)
        
        # Analyze uploaded image shape
        uploaded_shape = analyze_frame_shape(up_imgs[0])
        print(f"Uploaded image shape analysis: {uploaded_shape}", file=sys.stderr)
        
        # Boost scores for references with matching shape keywords
        # Rectangular/wayfarer keywords
        rectangular_keywords = ['rayban', 'ray_ban', 'wayfarer', 'black_glasses', 'rectangular', 'square', 'nerd', 'hipster', 'reading']
        round_keywords = ['round', 'circle', 'metal_round', 'lennon', 'vintage']
        
        sims_boosted = sims.clone()
        for i, ref_name in enumerate(ref_filenames):
            ref_lower = ref_name.lower()
            
            if uploaded_shape.get("is_rectangular"):
                # Boost rectangular frame references
                for kw in rectangular_keywords:
                    if kw in ref_lower:
                        sims_boosted[i] += 0.15  # Boost by 15%
                        print(f"  Boosting {ref_name} (rectangular match)", file=sys.stderr)
                        break
                # Penalize round frames
                for kw in round_keywords:
                    if kw in ref_lower:
                        sims_boosted[i] -= 0.1
                        break
            elif uploaded_shape.get("is_round"):
                # Boost round frame references
                for kw in round_keywords:
                    if kw in ref_lower:
                        sims_boosted[i] += 0.15
                        print(f"  Boosting {ref_name} (round match)", file=sys.stderr)
                        break
                # Penalize rectangular frames
                for kw in rectangular_keywords:
                    if kw in ref_lower:
                        sims_boosted[i] -= 0.1
                        break
        
        best_idx = int(torch.argmax(sims_boosted).item())
        best_score = float(sims[best_idx].item())  # Use original score for confidence
        best_ref = ref_filenames[best_idx]

        base = os.path.splitext(best_ref)[0]
        confidence = (best_score + 1.0) / 2.0

        print(f"Best match: {best_ref} with score {best_score:.3f}", file=sys.stderr)

        # Extract color and material properties from uploaded images
        properties = extract_glasses_properties(image_paths)
        print(f"Extracted properties: {properties}", file=sys.stderr)

        return {
            "best_model": base + ".glb",
            "confidence": round(confidence, 3),
            "source_image": best_ref,
            "matched": True,
            "method": "clip_cached",
            **properties  # Include lensColor, frameColor, tintOpacity, frameMaterial, frameMetalness
        }

    except Exception as e:
        print(f"Matching error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        return simple_match(image_paths)


def main():
    if "--build" in sys.argv:
        success = build_embeddings()
        print(json.dumps({"ok": success}))
        return

    images = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not images:
        print(json.dumps({"error": "No images", "matched": False}))
        return

    result = clip_match(images)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback

        traceback.print_exc(file=sys.stderr)
        print(
            json.dumps({"error": str(e), "matched": False, "method": "crash_handler"})
        )
        sys.exit(0)  # Exit properly so node can parse the json
