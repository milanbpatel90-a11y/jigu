#!/usr/bin/env python3
"""
AI Vision Matcher - Uses GPT-4 Vision to find visually similar 3D glasses models
Matches based on actual visual appearance of glasses, not just model names

Author: AI Glasses Finder
Version: 2.0.0
"""

import sys
import os
import json
import base64
import colorsys
import hashlib
from typing import Dict, List, Optional, Tuple
from pathlib import Path

# Try to import OpenAI
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    print("OpenAI not installed, will use fallback matching", file=sys.stderr)

# Try to import image processing libraries
try:
    from PIL import Image
    import numpy as np
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("PIL/numpy not installed, color extraction limited", file=sys.stderr)

# Configuration
MODELS_CACHE_FILE = "models_cache.json"
REF_DIR = "reference_images"
MODEL_FEATURES_CACHE = "model_features_cache.json"
VISION_ANALYSIS_CACHE = "vision_analysis_cache.json"


def encode_image_base64(image_path: str) -> str:
    """Encode image to base64 for GPT-4 Vision"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def get_image_hash(image_path: str) -> str:
    """Get hash of image file for caching"""
    with open(image_path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def get_image_mime_type(image_path: str) -> str:
    """Get MIME type from image extension"""
    ext = Path(image_path).suffix.lower()
    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif"
    }
    return mime_types.get(ext, "image/jpeg")


def load_json_cache(filepath: str) -> Dict:
    """Load JSON cache file"""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading cache {filepath}: {e}", file=sys.stderr)
    return {}


def save_json_cache(filepath: str, data: Dict):
    """Save JSON cache file"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving cache {filepath}: {e}", file=sys.stderr)


def analyze_glasses_with_gpt4(image_paths: List[str], api_key: str = None) -> Optional[Dict]:
    """
    Use GPT-4 Vision to analyze glasses images and extract detailed visual features.
    This is the core AI analysis that examines the actual appearance of glasses.
    """
    if not HAS_OPENAI:
        print("OpenAI library not available", file=sys.stderr)
        return None

    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("No OpenAI API key found in environment", file=sys.stderr)
        return None

    # Check cache first
    cache = load_json_cache(VISION_ANALYSIS_CACHE)
    cache_key = "_".join([get_image_hash(p) for p in image_paths[:4] if os.path.exists(p)])

    if cache_key and cache_key in cache:
        print("Using cached GPT-4 Vision analysis", file=sys.stderr)
        return cache[cache_key]

    client = OpenAI(api_key=api_key)

    # Prepare images for GPT-4 Vision
    image_content = []
    for img_path in image_paths[:4]:  # Max 4 images
        try:
            if not os.path.exists(img_path):
                continue
            base64_img = encode_image_base64(img_path)
            mime_type = get_image_mime_type(img_path)
            image_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{base64_img}",
                    "detail": "high"
                }
            })
        except Exception as e:
            print(f"Error encoding image {img_path}: {e}", file=sys.stderr)
            continue

    if not image_content:
        print("No valid images to analyze", file=sys.stderr)
        return None

    # Comprehensive GPT-4 Vision analysis prompt
    analysis_prompt = """Analyze these eyeglasses/sunglasses images very carefully. Look at the ACTUAL visual appearance.

Return ONLY a valid JSON object with these exact fields (no markdown, no explanation):
{
    "shape": "round" | "rectangular" | "square" | "oval" | "aviator" | "cat_eye" | "wayfarer" | "oversized" | "geometric" | "heart" | "rimless" | "semi_rimless" | "sport" | "wrap" | "pilot" | "clubmaster" | "browline",
    "frame_color_hex": "#RRGGBB (exact hex color of the frame)",
    "frame_color_name": "black" | "brown" | "gold" | "silver" | "tortoise" | "clear" | "white" | "red" | "blue" | "green" | "pink" | "purple" | "rose_gold" | "gunmetal" | "bronze" | "multicolor",
    "lens_color_hex": "#RRGGBB or null if clear/transparent",
    "lens_type": "clear" | "tinted" | "gradient" | "mirrored" | "polarized" | "photochromic",
    "lens_tint_percentage": 0-100 (0 for clear, 100 for fully dark),
    "material": "metal" | "plastic" | "acetate" | "titanium" | "wood" | "carbon_fiber" | "mixed" | "tr90",
    "frame_thickness": "thin" | "medium" | "thick" | "bold" | "rimless",
    "style": "vintage" | "modern" | "classic" | "sporty" | "luxury" | "casual" | "retro" | "futuristic" | "minimalist" | "bold" | "elegant" | "hipster" | "professional",
    "bridge_type": "standard" | "keyhole" | "saddle" | "adjustable" | "double",
    "temple_style": "standard" | "thick" | "thin" | "decorated" | "cable",
    "gender_style": "unisex" | "masculine" | "feminine",
    "size": "small" | "medium" | "large" | "oversized",
    "brand_similarity": "ray-ban" | "oakley" | "gucci" | "prada" | "chanel" | "persol" | "tom_ford" | "carrera" | "generic" | "vintage" | "designer" | "sport_brand",
    "distinctive_features": ["list", "of", "notable", "features"],
    "overall_aesthetic": "2-4 word description like 'classic professional' or 'bold trendy' or 'retro chic'"
}

IMPORTANT:
- Analyze the ACTUAL colors you see in the image
- Be specific about the shape - look at the lens shape primarily
- Consider all angles if multiple images provided
- Return ONLY the JSON, no other text"""

    try:
        print("Calling GPT-4 Vision API...", file=sys.stderr)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert eyewear analyst with deep knowledge of glasses styles, shapes, and materials. Analyze images with extreme precision. Return only valid JSON without any markdown formatting."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": analysis_prompt},
                        *image_content
                    ]
                }
            ],
            max_tokens=1000,
            temperature=0.1
        )

        result_text = response.choices[0].message.content.strip()
        print(f"GPT-4 raw response length: {len(result_text)}", file=sys.stderr)

        # Extract JSON from response (handle markdown code blocks if present)
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()

        # Parse and validate
        result = json.loads(result_text)

        # Cache the result
        if cache_key:
            cache[cache_key] = result
            save_json_cache(VISION_ANALYSIS_CACHE, cache)

        print(f"GPT-4 Vision analysis complete: shape={result.get('shape')}, "
              f"material={result.get('material')}, style={result.get('style')}", file=sys.stderr)

        return result

    except json.JSONDecodeError as e:
        print(f"Failed to parse GPT-4 response as JSON: {e}", file=sys.stderr)
        print(f"Response was: {result_text[:500]}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"GPT-4 Vision analysis failed: {e}", file=sys.stderr)
        return None


def compare_images_with_gpt4(uploaded_paths: List[str], reference_path: str, api_key: str = None) -> float:
    """
    Use GPT-4 Vision to directly compare uploaded image with a reference image.
    Returns similarity score 0-1.
    """
    if not HAS_OPENAI:
        return 0.5

    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return 0.5

    client = OpenAI(api_key=api_key)

    try:
        # Prepare images
        image_content = []

        # Add uploaded image (first one)
        if uploaded_paths and os.path.exists(uploaded_paths[0]):
            base64_img = encode_image_base64(uploaded_paths[0])
            mime_type = get_image_mime_type(uploaded_paths[0])
            image_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{base64_img}", "detail": "low"}
            })

        # Add reference image
        if os.path.exists(reference_path):
            base64_ref = encode_image_base64(reference_path)
            mime_type_ref = get_image_mime_type(reference_path)
            image_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type_ref};base64,{base64_ref}", "detail": "low"}
            })

        if len(image_content) < 2:
            return 0.5

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You compare glasses images. Return only a number between 0 and 100."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Compare these two glasses images. First is the query, second is a reference. Rate similarity from 0-100 based on shape, style, and overall look. Return ONLY a number."},
                        *image_content
                    ]
                }
            ],
            max_tokens=10,
            temperature=0.1
        )

        score_text = response.choices[0].message.content.strip()
        score = float(''.join(c for c in score_text if c.isdigit() or c == '.'))
        return min(1.0, score / 100.0)

    except Exception as e:
        print(f"Image comparison failed: {e}", file=sys.stderr)
        return 0.5


def extract_colors_from_images(image_paths: List[str]) -> Dict:
    """Extract lens and frame colors using image analysis"""
    if not HAS_PIL:
        return {
            "lensColor": "#3b82f6",
            "frameColor": "#1a1a1a",
            "tintOpacity": 0.5,
            "frameMaterial": "plastic",
            "frameMetalness": 0.1,
            "frameScale": 1.0
        }

    frame_colors = []
    lens_colors = []
    frame_pixels_all = []

    for img_path in image_paths:
        try:
            if not os.path.exists(img_path):
                continue

            img = Image.open(img_path).convert('RGB')
            w, h = img.size

            # Resize for processing
            img_small = img.resize((100, 100))
            pixels = np.array(img_small).reshape(-1, 3)
            brightness = np.mean(pixels, axis=1)

            # Frame detection: darker pixels (not too dark = background)
            dark_mask = (brightness > 15) & (brightness < 130)
            dark_pixels = pixels[dark_mask]

            if len(dark_pixels) > 20:
                frame_color = np.median(dark_pixels, axis=0).astype(int)
                frame_colors.append(frame_color)
                frame_pixels_all.extend(dark_pixels.tolist())

            # Lens detection: center region with semi-transparent appearance
            center = img.crop((w//4, h//4, 3*w//4, 3*h//4)).resize((50, 50))
            center_pixels = np.array(center).reshape(-1, 3)
            center_brightness = np.mean(center_pixels, axis=1)

            # Look for tinted areas
            tint_mask = (center_brightness > 50) & (center_brightness < 230)
            tint_pixels = center_pixels[tint_mask]

            if len(tint_pixels) > 10:
                lens_color = np.mean(tint_pixels, axis=0).astype(int)
                lens_colors.append(lens_color)

        except Exception as e:
            print(f"Color extraction error for {img_path}: {e}", file=sys.stderr)
            continue

    # Determine material from pixel analysis
    frame_pixels_arr = np.array(frame_pixels_all) if frame_pixels_all else np.array([[50, 50, 50]])

    if len(frame_pixels_arr) > 20:
        avg_brightness = np.mean(frame_pixels_arr)
        brightness_var = np.var(np.mean(frame_pixels_arr, axis=1))
        color_std = np.std(frame_pixels_arr, axis=0).mean()

        # Metal detection: uniform color with some brightness variation (reflection)
        is_silver = avg_brightness > 130 and color_std < 30
        is_gold = frame_pixels_arr[:, 0].mean() > frame_pixels_arr[:, 2].mean() + 20 and avg_brightness > 100

        if is_silver or is_gold or (color_std < 25 and brightness_var > 200):
            material = "metal"
            metalness = 0.8 if is_silver else 0.6
        else:
            material = "plastic"
            metalness = 0.1
    else:
        material = "plastic"
        metalness = 0.1

    # Calculate final frame color
    if frame_colors:
        fc = np.mean(frame_colors, axis=0).astype(int)
        frame_color = f"#{int(fc[0]):02x}{int(fc[1]):02x}{int(fc[2]):02x}"
    else:
        frame_color = "#1a1a1a"

    # Calculate final lens color
    if lens_colors:
        lc = np.mean(lens_colors, axis=0).astype(int)
        lens_color = f"#{int(lc[0]):02x}{int(lc[1]):02x}{int(lc[2]):02x}"
        # Calculate tint based on saturation
        h, s, v = colorsys.rgb_to_hsv(lc[0]/255, lc[1]/255, lc[2]/255)
        tint_opacity = min(0.85, max(0.2, s * 0.6 + 0.25))
    else:
        lens_color = "#3b82f6"
        tint_opacity = 0.5

    return {
        "lensColor": lens_color,
        "frameColor": frame_color,
        "tintOpacity": round(tint_opacity, 2),
        "frameMaterial": material,
        "frameMetalness": round(metalness, 2),
        "frameScale": 1.0
    }


def get_reference_images() -> List[Tuple[str, str]]:
    """Get list of reference images and their corresponding model names"""
    refs = []
    if os.path.isdir(REF_DIR):
        exts = {".jpg", ".jpeg", ".png", ".webp"}
        for f in sorted(os.listdir(REF_DIR)):
            ext = os.path.splitext(f.lower())[1]
            if ext in exts:
                model_name = os.path.splitext(f)[0] + ".glb"
                refs.append((os.path.join(REF_DIR, f), model_name))
    return refs


def load_available_models() -> List[str]:
    """Load available 3D models from cache"""
    try:
        if os.path.exists(MODELS_CACHE_FILE):
            with open(MODELS_CACHE_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading models cache: {e}", file=sys.stderr)
    return []


def calculate_feature_similarity(uploaded: Dict, reference: Dict) -> float:
    """Calculate similarity score between uploaded image features and reference features"""
    if not uploaded or not reference:
        return 0.5

    score = 0.0
    max_score = 100.0

    # Shape match (35 points - most important)
    u_shape = uploaded.get("shape", "").lower()
    r_shape = reference.get("shape", "").lower()

    if u_shape == r_shape:
        score += 35
    elif are_shapes_similar(u_shape, r_shape):
        score += 20
    elif are_shapes_somewhat_similar(u_shape, r_shape):
        score += 10

    # Frame color match (20 points)
    u_color = uploaded.get("frame_color_name", "").lower()
    r_color = reference.get("frame_color_name", "").lower()

    if u_color == r_color:
        score += 20
    elif are_colors_similar(u_color, r_color):
        score += 12

    # Also compare hex colors if available
    u_hex = uploaded.get("frame_color_hex", "#000000")
    r_hex = reference.get("frame_color_hex", "#000000")
    hex_sim = calculate_hex_color_similarity(u_hex, r_hex)
    score += 5 * hex_sim  # Up to 5 bonus points

    # Material match (15 points)
    u_mat = uploaded.get("material", "").lower()
    r_mat = reference.get("material", "").lower()

    if u_mat == r_mat:
        score += 15
    elif are_materials_similar(u_mat, r_mat):
        score += 8

    # Style match (10 points)
    u_style = uploaded.get("style", "").lower()
    r_style = reference.get("style", "").lower()

    if u_style == r_style:
        score += 10
    elif are_styles_similar(u_style, r_style):
        score += 5

    # Frame thickness match (5 points)
    if uploaded.get("frame_thickness") == reference.get("frame_thickness"):
        score += 5

    # Lens type match (5 points)
    if uploaded.get("lens_type") == reference.get("lens_type"):
        score += 5

    # Size match (5 points)
    if uploaded.get("size") == reference.get("size"):
        score += 5

    return score / max_score


def are_shapes_similar(shape1: str, shape2: str) -> bool:
    """Check if two shapes are very similar"""
    similar_groups = [
        {"round", "oval", "circular"},
        {"rectangular", "square"},
        {"aviator", "pilot", "teardrop"},
        {"cat_eye", "butterfly", "upswept"},
        {"wayfarer", "clubmaster", "browline"},
        {"sport", "wrap", "shield"},
        {"geometric", "hexagonal", "octagonal"},
    ]
    for group in similar_groups:
        if shape1 in group and shape2 in group:
            return True
    return False


def are_shapes_somewhat_similar(shape1: str, shape2: str) -> bool:
    """Check if shapes are somewhat related"""
    related = [
        {"round", "oval", "oversized"},
        {"rectangular", "square", "wayfarer"},
        {"aviator", "sport", "oversized"},
    ]
    for group in related:
        if shape1 in group and shape2 in group:
            return True
    return False


def are_colors_similar(color1: str, color2: str) -> bool:
    """Check if two color names are similar"""
    similar = [
        {"black", "gunmetal", "dark"},
        {"gold", "bronze", "rose_gold"},
        {"silver", "gunmetal", "chrome"},
        {"brown", "tortoise", "havana"},
        {"clear", "transparent", "crystal"},
    ]
    for group in similar:
        if color1 in group and color2 in group:
            return True
    return False


def calculate_hex_color_similarity(hex1: str, hex2: str) -> float:
    """Calculate similarity between two hex colors (0-1)"""
    try:
        if not hex1 or not hex2 or hex1 == "null" or hex2 == "null":
            return 0.5

        hex1 = hex1.lstrip('#')
        hex2 = hex2.lstrip('#')

        if len(hex1) != 6 or len(hex2) != 6:
            return 0.5

        r1, g1, b1 = int(hex1[0:2], 16), int(hex1[2:4], 16), int(hex1[4:6], 16)
        r2, g2, b2 = int(hex2[0:2], 16), int(hex2[2:4], 16), int(hex2[4:6], 16)

        # Euclidean distance in RGB space
        distance = ((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) ** 0.5
        max_distance = (255**2 * 3) ** 0.5

        return 1 - (distance / max_distance)
    except:
        return 0.5


def are_materials_similar(mat1: str, mat2: str) -> bool:
    """Check if materials are similar"""
    similar = [
        {"plastic", "acetate", "tr90"},
        {"metal", "titanium", "steel"},
    ]
    for group in similar:
        if mat1 in group and mat2 in group:
            return True
    return False


def are_styles_similar(style1: str, style2: str) -> bool:
    """Check if styles are similar"""
    similar = [
        {"vintage", "retro", "classic"},
        {"modern", "minimalist", "contemporary"},
        {"sporty", "athletic", "active"},
        {"luxury", "elegant", "designer"},
        {"bold", "statement", "oversized"},
        {"casual", "everyday", "professional"},
    ]
    for group in similar:
        if style1 in group and style2 in group:
            return True
    return False


def infer_features_from_model_name(model_name: str) -> Dict:
    """Infer basic features from model filename for fallback matching"""
    name_lower = model_name.lower()

    features = {
        "shape": "rectangular",
        "material": "plastic",
        "style": "casual",
        "frame_color_name": "black",
        "frame_thickness": "medium",
        "lens_type": "clear",
        "size": "medium"
    }

    # Shape detection
    shape_patterns = [
        (["round", "circle", "lennon", "john_lennon"], "round"),
        (["oval"], "oval"),
        (["aviator", "pilot", "ray_ban", "rayban"], "aviator"),
        (["cat_eye", "cat-eye", "cateye", "butterfly"], "cat_eye"),
        (["wayfarer", "clubmaster", "browline"], "wayfarer"),
        (["sport", "oakley", "wrap", "shield"], "sport"),
        (["heart"], "heart"),
        (["square"], "square"),
        (["rectangular", "rectangle", "nerd", "reading"], "rectangular"),
        (["oversized", "big", "large"], "oversized"),
        (["geometric", "hexagon", "octagon"], "geometric"),
        (["rimless", "frameless"], "rimless"),
    ]

    for keywords, shape in shape_patterns:
        if any(kw in name_lower for kw in keywords):
            features["shape"] = shape
            break

    # Material detection
    if any(kw in name_lower for kw in ["metal", "titanium", "steel", "wire"]):
        features["material"] = "metal"
    elif any(kw in name_lower for kw in ["acetate", "tortoise"]):
        features["material"] = "acetate"
    elif any(kw in name_lower for kw in ["wood", "bamboo"]):
        features["material"] = "wood"

    # Style detection
    style_patterns = [
        (["vintage", "retro", "classic", "prada"], "vintage"),
        (["futuristic", "cyber", "vr", "tech"], "futuristic"),
        (["luxury", "chanel", "gucci", "dior", "tom_ford"], "luxury"),
        (["sport", "oakley", "athletic"], "sporty"),
        (["hipster", "nerd"], "hipster"),
        (["minimalist", "simple", "clean"], "minimalist"),
    ]

    for keywords, style in style_patterns:
        if any(kw in name_lower for kw in keywords):
            features["style"] = style
            break

    # Color detection
    color_patterns = [
        (["gold", "golden"], "gold"),
        (["silver", "chrome"], "silver"),
        (["tortoise", "havana", "amber"], "tortoise"),
        (["clear", "transparent", "crystal"], "clear"),
        (["white"], "white"),
        (["red", "burgundy"], "red"),
        (["blue", "navy"], "blue"),
        (["green"], "green"),
        (["pink", "rose"], "pink"),
        (["brown", "tan"], "brown"),
    ]

    for keywords, color in color_patterns:
        if any(kw in name_lower for kw in keywords):
            features["frame_color_name"] = color
            break

    # Thickness
    if any(kw in name_lower for kw in ["thick", "bold", "chunky"]):
        features["frame_thickness"] = "thick"
    elif any(kw in name_lower for kw in ["thin", "wire", "slim"]):
        features["frame_thickness"] = "thin"

    # Lens type
    if any(kw in name_lower for kw in ["sun", "tint", "dark"]):
        features["lens_type"] = "tinted"
    elif any(kw in name_lower for kw in ["mirror"]):
        features["lens_type"] = "mirrored"

    return features


def find_model_by_shape(shape: str, models: List[str]) -> Tuple[str, float]:
    """Find a model matching the detected shape"""

    shape_keywords = {
        "round": ["round", "circle", "metal_round", "lennon", "oval"],
        "oval": ["oval", "round"],
        "rectangular": ["rectangular", "square", "black_glasses", "nerd", "reading", "hipster"],
        "square": ["square", "rectangular"],
        "aviator": ["aviator", "ray_ban", "rayban", "pilot"],
        "cat_eye": ["cat_eye", "cat-eye", "cateye"],
        "wayfarer": ["wayfarer", "classic", "clubmaster"],
        "sport": ["sport", "oakley", "wrap", "shield", "laser"],
        "heart": ["heart"],
        "oversized": ["oversized", "big", "large"],
        "geometric": ["geometric", "hexagon"],
        "futuristic": ["futuristic", "vr", "cyber", "neon"],
        "rimless": ["rimless", "frameless"],
    }

    keywords = shape_keywords.get(shape, [shape])

    # Find models matching the keywords
    for model in models:
        model_lower = model.lower()
        for keyword in keywords:
            if keyword in model_lower:
                return model, 0.70

    # Second pass: look for generic glasses
    for model in models:
        if "glasses" in model.lower() and not any(x in model.lower() for x in ["vr", "3d", "pixel"]):
            return model, 0.55

    # Fallback to first model
    return models[0] if models else "3d_glasses.glb", 0.40


def find_best_match_vision(image_paths: List[str]) -> Dict:
    """
    Main matching function - Uses GPT-4 Vision for visual similarity matching.
    Falls back to shape-based matching if GPT-4 is not available.
    """

    # Load available models
    models = load_available_models()
    if not models:
        models = ["3d_glasses.glb"]

    print(f"Loaded {len(models)} available 3D models", file=sys.stderr)

    # Extract colors from uploaded images (always needed for 3D model customization)
    color_properties = extract_colors_from_images(image_paths)
    print(f"Extracted colors: frame={color_properties.get('frameColor')}, "
          f"lens={color_properties.get('lensColor')}", file=sys.stderr)

    # Try GPT-4 Vision analysis
    uploaded_features = None
    if HAS_OPENAI and os.environ.get("OPENAI_API_KEY"):
        print("🔍 Analyzing with GPT-4 Vision...", file=sys.stderr)
        uploaded_features = analyze_glasses_with_gpt4(image_paths)

        if uploaded_features:
            # Override color properties with GPT-4's analysis (more accurate)
            if uploaded_features.get("frame_color_hex"):
                color_properties["frameColor"] = uploaded_features["frame_color_hex"]
            if uploaded_features.get("lens_color_hex"):
                color_properties["lensColor"] = uploaded_features["lens_color_hex"]
            if uploaded_features.get("material"):
                color_properties["frameMaterial"] = uploaded_features["material"]
                color_properties["frameMetalness"] = 0.7 if uploaded_features["material"] in ["metal", "titanium"] else 0.1
            if uploaded_features.get("lens_tint_percentage") is not None:
                color_properties["tintOpacity"] = uploaded_features["lens_tint_percentage"] / 100.0
    else:
        print("⚠️ GPT-4 Vision not available, using fallback matching", file=sys.stderr)

    # Get reference images for comparison
    reference_images = get_reference_images()
    print(f"Found {len(reference_images)} reference images for matching", file=sys.stderr)

    best_match = None
    best_score = 0.0
    match_method = "fallback"

    # Method 1: If we have GPT-4 features and reference images, use feature comparison
    if uploaded_features and reference_images:
        print("📊 Comparing features against reference images...", file=sys.stderr)
        features_cache = load_json_cache(MODEL_FEATURES_CACHE)

        for ref_path, model_name in reference_images:
            # Check if model exists in our available models
            if model_name not in models:
                continue

            cache_key = os.path.basename(ref_path)

            # Get or infer features for reference
            if cache_key in features_cache:
                ref_features = features_cache[cache_key]
            else:
                ref_features = infer_features_from_model_name(model_name)
                features_cache[cache_key] = ref_features

            # Calculate similarity
            similarity = calculate_feature_similarity(uploaded_features, ref_features)

            if similarity > best_score:
                best_score = similarity
                best_match = model_name
                print(f"  ✓ {model_name}: {similarity:.2%} match", file=sys.stderr)

        # Save updated features cache
        save_json_cache(MODEL_FEATURES_CACHE, features_cache)
        match_method = "vision_features"

    # Method 2: Shape-based matching using detected shape
    if not best_match or best_score < 0.4:
        detected_shape = uploaded_features.get("shape", "rectangular") if uploaded_features else "rectangular"
        print(f"🔷 Using shape-based matching for shape: {detected_shape}", file=sys.stderr)

        shape_match, shape_score = find_model_by_shape(detected_shape, models)

        if not best_match or shape_score > best_score:
            best_match = shape_match
            best_score = shape_score
            match_method = "shape_matching"

    # Ensure we have a match
    if not best_match:
        best_match = models[0] if models else "3d_glasses.glb"
        best_score = 0.40

    print(f"✅ Best match: {best_match} ({best_score:.1%} confidence)", file=sys.stderr)

    return {
        "best_model": best_match,
        "confidence": round(best_score, 3),
        "source_image": "gpt4_vision" if uploaded_features else "shape_analysis",
        "matched": True,
        "method": match_method,
        "detected_shape": uploaded_features.get("shape") if uploaded_features else None,
        "detected_style": uploaded_features.get("style") if uploaded_features else None,
        "detected_material": uploaded_features.get("material") if uploaded_features else None,
        "detected_features": uploaded_features,
        **color_properties
    }


def analyze_all_reference_images():
    """
    Pre-analyze all reference images with GPT-4 Vision.
    Run this once to build the features cache for faster matching.
    """
    print("🔄 Analyzing all reference images with GPT-4 Vision...", file=sys.stderr)

    if not HAS_OPENAI or not os.environ.get("OPENAI_API_KEY"):
        print("❌ OpenAI API key required for this operation", file=sys.stderr)
        return {"ok": False, "error": "OpenAI API key not configured"}

    reference_images = get_reference_images()
    features_cache = load_json_cache(MODEL_FEATURES_CACHE)

    analyzed = 0
    skipped = 0

    for ref_path, model_name in reference_images:
        cache_key = os.path.basename(ref_path)

        if cache_key in features_cache and "shape" in features_cache[cache_key]:
            skipped += 1
            continue

        print(f"  Analyzing: {cache_key}", file=sys.stderr)
        features = analyze_glasses_with_gpt4([ref_path])

        if features:
            features_cache[cache_key] = features
            save_json_cache(MODEL_FEATURES_CACHE, features_cache)
            analyzed += 1
            print(f"    → {features.get('shape')}, {features.get('material')}, {features.get('style')}", file=sys.stderr)
        else:
            # Fallback to name inference
            features_cache[cache_key] = infer_features_from_model_name(model_name)
            analyzed += 1

    print(f"✅ Analyzed {analyzed} images, skipped {skipped} cached", file=sys.stderr)
    return {"ok": True, "analyzed": analyzed, "skipped": skipped, "total": len(features_cache)}


def main():
    """Main entry point"""

    # Handle command line arguments
    if "--build" in sys.argv or "--analyze-references" in sys.argv:
        result = analyze_all_reference_images()
        print(json.dumps(result))
        return

    if "--help" in sys.argv:
        print("Usage: python vision_matcher.py [options] <image1> [image2] ...")
        print("Options:")
        print("  --build, --analyze-references  Pre-analyze reference images")
        print("  --help                         Show this help")
        return

    # Get image paths from arguments
    images = [arg for arg in sys.argv[1:] if not arg.startswith("--")]

    if not images:
        print(json.dumps({"error": "No images provided", "matched": False}))
        return

    # Verify images exist
    valid_images = [img for img in images if os.path.exists(img)]
    if not valid_images:
        print(json.dumps({"error": "No valid image files found", "matched": False}))
        return

    # Run matching
    result = find_best_match_vision(valid_images)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({
            "error": str(e),
            "matched": False,
            "method": "crash_handler"
        }))
        sys.exit(0)
