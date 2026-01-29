#!/usr/bin/env python3
"""
AI Vision Matcher - Uses FREE AI Vision APIs to find visually similar 3D glasses models
Matches based on actual visual appearance of glasses, not just model names

Supported AI Providers (in order of preference):
1. Google Gemini - 15 req/min, 1500 req/day FREE
2. Local CLIP - No API needed, runs locally (BEST FALLBACK)
3. Hugging Face - Unlimited with rate limits FREE
4. OpenAI GPT-4 Vision - Paid option

Author: AI Glasses Finder
Version: 3.1.0 - Enhanced local CLIP matching (no API required)
"""

import sys
import os
import json
import base64
import colorsys
import hashlib
from typing import Dict, List, Optional, Tuple
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Load from backend/.env or current directory
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded .env from {env_path}", file=sys.stderr)
    else:
        load_dotenv()  # Try default locations
except ImportError:
    print("python-dotenv not installed, using system env vars", file=sys.stderr)

# Try to import Groq - FREE (fastest inference, generous limits)
try:
    from groq import Groq
    HAS_GROQ = True
    print("✅ Groq available (FREE - fastest)", file=sys.stderr)
except ImportError:
    HAS_GROQ = False
    print("Groq not installed: pip install groq", file=sys.stderr)

# Try to import Google Generative AI (Gemini) - FREE
try:
    from google import genai
    HAS_GEMINI = True
    print("✅ Google Gemini available (FREE)", file=sys.stderr)
except ImportError:
    try:
        # Fallback to old package
        import google.generativeai as genai_old
        HAS_GEMINI = True
        print("✅ Google Gemini available (old package)", file=sys.stderr)
    except ImportError:
        HAS_GEMINI = False
        print("Google Gemini not installed: pip install google-genai", file=sys.stderr)

# Try to import Hugging Face for free inference - FREE
try:
    import requests as hf_requests
    HAS_HUGGINGFACE = True
    print("✅ Hugging Face available (FREE)", file=sys.stderr)
except ImportError:
    HAS_HUGGINGFACE = False

# Try to import OpenAI (paid - used as last resort)
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    print("OpenAI not installed (optional - paid service)", file=sys.stderr)

# Try to import image processing libraries
try:
    from PIL import Image, ImageFilter
    import numpy as np
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("PIL/numpy not installed, color extraction limited", file=sys.stderr)

# Try to import rembg for background removal
try:
    from rembg import remove as remove_bg
    HAS_REMBG = True
    print("rembg available for background removal", file=sys.stderr)
except ImportError:
    HAS_REMBG = False
    print("rembg not installed, using basic background removal", file=sys.stderr)

# Try to import CLIP for local matching (NO API NEEDED)
# Using sentence-transformers which has better compatibility
HAS_CLIP = False
try:
    from sentence_transformers import SentenceTransformer, util
    from PIL import Image as PILImage
    import torch
    HAS_CLIP = True
    print("✅ Local CLIP available (NO API NEEDED - sentence-transformers)", file=sys.stderr)
except ImportError:
    print("sentence-transformers not installed: pip install sentence-transformers", file=sys.stderr)

# Configuration
MODELS_CACHE_FILE = "models_cache.json"
REF_DIR = "reference_images"
MODEL_FEATURES_CACHE = "model_features_cache.json"
VISION_ANALYSIS_CACHE = "vision_analysis_cache.json"
TEMP_DIR = "uploads"

# Hugging Face API endpoint (FREE)
HF_API_URL = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large"
HF_VISION_URL = "https://api-inference.huggingface.co/models/llava-hf/llava-1.5-7b-hf"


def remove_background(image_path: str) -> str:
    """
    Remove background from glasses image for better AI analysis.
    Returns path to processed image (or original if removal fails).
    """
    if not HAS_PIL:
        return image_path

    try:
        img = Image.open(image_path).convert('RGBA')

        # Method 1: Use rembg if available (best quality)
        if HAS_REMBG:
            print(f"  Removing background with rembg: {os.path.basename(image_path)}", file=sys.stderr)
            output = remove_bg(img)
            # Save to temp file
            temp_path = os.path.join(TEMP_DIR, f"nobg_{os.path.basename(image_path)}")
            if not temp_path.lower().endswith('.png'):
                temp_path = temp_path.rsplit('.', 1)[0] + '.png'
            output.save(temp_path, 'PNG')
            return temp_path

        # Method 2: Simple background removal using edge detection and color analysis
        print(f"  Removing background (basic): {os.path.basename(image_path)}", file=sys.stderr)
        img_array = np.array(img.convert('RGB'))

        # Detect edges
        gray = np.mean(img_array, axis=2)

        # Simple gradient-based edge detection
        gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
        gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
        edges = np.sqrt(gx**2 + gy**2)

        # Create mask: keep areas with edges or darker colors (likely glasses)
        edge_threshold = 15
        brightness_threshold = 240

        edge_mask = edges > edge_threshold
        dark_mask = gray < brightness_threshold

        # Combine masks
        mask = edge_mask | dark_mask

        # Dilate mask to include nearby pixels
        from scipy import ndimage
        mask = ndimage.binary_dilation(mask, iterations=5)
        mask = ndimage.binary_fill_holes(mask)

        # Apply mask - set background to white
        result = img_array.copy()
        for c in range(3):
            result[:, :, c] = np.where(mask, result[:, :, c], 255)

        # Save result
        output = Image.fromarray(result.astype(np.uint8))
        temp_path = os.path.join(TEMP_DIR, f"nobg_{os.path.basename(image_path)}")
        if not temp_path.lower().endswith('.png'):
            temp_path = temp_path.rsplit('.', 1)[0] + '.png'
        output.save(temp_path, 'PNG')
        return temp_path

    except ImportError:
        # scipy not available, return original
        print("  scipy not available for background removal", file=sys.stderr)
        return image_path
    except Exception as e:
        print(f"  Background removal failed: {e}", file=sys.stderr)
        return image_path


def preprocess_images(image_paths: List[str], remove_bg_flag: bool = True) -> List[str]:
    """
    Preprocess images before analysis: remove background, enhance contrast.
    Returns list of processed image paths.
    """
    if not remove_bg_flag:
        return image_paths

    processed = []
    for path in image_paths:
        if os.path.exists(path):
            processed_path = remove_background(path)
            processed.append(processed_path)
        else:
            processed.append(path)

    return processed


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


def analyze_glasses_with_clip(image_paths: List[str]) -> Optional[Dict]:
    """
    Use LOCAL CLIP model via sentence-transformers to analyze glasses images.
    NO API KEY NEEDED - runs completely offline!

    This is the most reliable fallback as it doesn't depend on external services.
    Uses sentence-transformers which avoids TensorFlow conflicts.
    """
    if not HAS_CLIP or not HAS_PIL:
        print("CLIP or PIL not available for local matching", file=sys.stderr)
        return None

    print("🔍 Using Local CLIP (NO API NEEDED)...", file=sys.stderr)

    try:
        # Load CLIP model via sentence-transformers (cached after first load)
        print("  Loading CLIP model (sentence-transformers)...", file=sys.stderr)
        model = SentenceTransformer('clip-ViT-B-32')

        # Load image
        if not image_paths or not os.path.exists(image_paths[0]):
            return None

        image = Image.open(image_paths[0]).convert("RGB")

        # Encode image
        img_embedding = model.encode(image, convert_to_tensor=True)

        # Define glasses shape categories for CLIP classification
        shape_prompts = [
            "round circular glasses",
            "rectangular square glasses",
            "aviator pilot sunglasses",
            "cat eye feminine glasses",
            "wayfarer classic glasses",
            "oversized big glasses",
            "oval shaped glasses",
            "sport wrap around glasses",
            "geometric hexagonal glasses",
            "rimless frameless glasses",
            "heart shaped glasses",
            "clubmaster browline glasses"
        ]

        shape_map = {
            0: "round", 1: "rectangular", 2: "aviator", 3: "cat_eye",
            4: "wayfarer", 5: "oversized", 6: "oval", 7: "sport",
            8: "geometric", 9: "rimless", 10: "heart", 11: "clubmaster"
        }

        # Classify shape
        text_embeddings = model.encode(shape_prompts, convert_to_tensor=True)
        similarities = util.cos_sim(img_embedding, text_embeddings)[0]
        shape_idx = similarities.argmax().item()
        shape_confidence = similarities[shape_idx].item()

        detected_shape = shape_map.get(shape_idx, "rectangular")
        print(f"  Shape detected: {detected_shape} ({shape_confidence:.1%} confidence)", file=sys.stderr)

        # Define material categories
        material_prompts = [
            "metal wire frame glasses",
            "plastic acetate frame glasses",
            "titanium lightweight glasses",
            "wooden frame glasses"
        ]
        material_map = {0: "metal", 1: "plastic", 2: "titanium", 3: "wood"}

        text_embeddings = model.encode(material_prompts, convert_to_tensor=True)
        similarities = util.cos_sim(img_embedding, text_embeddings)[0]
        material_idx = similarities.argmax().item()

        detected_material = material_map.get(material_idx, "plastic")
        print(f"  Material detected: {detected_material}", file=sys.stderr)

        # Define style categories
        style_prompts = [
            "vintage retro classic glasses",
            "modern minimalist glasses",
            "sporty athletic sunglasses",
            "luxury designer expensive glasses",
            "casual everyday glasses",
            "futuristic tech glasses"
        ]
        style_map = {0: "vintage", 1: "modern", 2: "sporty", 3: "luxury", 4: "casual", 5: "futuristic"}

        text_embeddings = model.encode(style_prompts, convert_to_tensor=True)
        similarities = util.cos_sim(img_embedding, text_embeddings)[0]
        style_idx = similarities.argmax().item()

        detected_style = style_map.get(style_idx, "casual")
        print(f"  Style detected: {detected_style}", file=sys.stderr)

        # Define color categories
        color_prompts = [
            "black colored glasses frame",
            "brown tortoise colored glasses",
            "gold golden colored glasses",
            "silver chrome colored glasses",
            "clear transparent glasses",
            "blue colored glasses frame",
            "red colored glasses frame",
            "pink rose colored glasses"
        ]
        color_map = {0: "black", 1: "brown", 2: "gold", 3: "silver", 4: "clear", 5: "blue", 6: "red", 7: "pink"}

        text_embeddings = model.encode(color_prompts, convert_to_tensor=True)
        similarities = util.cos_sim(img_embedding, text_embeddings)[0]
        color_idx = similarities.argmax().item()

        detected_color = color_map.get(color_idx, "black")
        print(f"  Color detected: {detected_color}", file=sys.stderr)

        # Define thickness categories
        thickness_prompts = [
            "thin wire frame glasses",
            "medium thickness frame glasses",
            "thick bold chunky frame glasses"
        ]
        thickness_map = {0: "thin", 1: "medium", 2: "thick"}

        text_embeddings = model.encode(thickness_prompts, convert_to_tensor=True)
        similarities = util.cos_sim(img_embedding, text_embeddings)[0]
        thickness_idx = similarities.argmax().item()

        detected_thickness = thickness_map.get(thickness_idx, "medium")

        print(f"✅ CLIP analysis complete: {detected_shape}, {detected_material}, {detected_style}", file=sys.stderr)

        return {
            "shape": detected_shape,
            "frame_color_name": detected_color,
            "material": detected_material,
            "style": detected_style,
            "frame_thickness": detected_thickness,
            "lens_type": "clear",
            "size": "medium",
            "method": "local_clip"
        }

    except Exception as e:
        print(f"CLIP analysis failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None


def analyze_glasses_with_gemini(image_paths: List[str], api_key: str = None) -> Optional[Dict]:
    """
    Use Google Gemini Vision (FREE) to analyze glasses images.
    FREE TIER: 15 requests/minute, 1500 requests/day
    """
    if not HAS_GEMINI:
        print("Google Gemini not available", file=sys.stderr)
        return None

    api_key = api_key or os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("No Google API key found. Get FREE key at: https://aistudio.google.com/app/apikey", file=sys.stderr)
        return None

    print(f"🔍 Using Google Gemini (FREE): {api_key[:10]}...{api_key[-4:]}", file=sys.stderr)

    # Analysis prompt
    prompt = """Analyze these eyeglasses/sunglasses images carefully.

Return ONLY a valid JSON object with these exact fields (no markdown, no explanation):
{
    "shape": "round" | "rectangular" | "square" | "oval" | "aviator" | "cat_eye" | "wayfarer" | "oversized" | "geometric" | "heart" | "rimless" | "sport" | "wrap" | "pilot" | "clubmaster",
    "frame_color_hex": "#RRGGBB",
    "frame_color_name": "black" | "brown" | "gold" | "silver" | "tortoise" | "clear" | "white" | "red" | "blue" | "green" | "pink" | "purple" | "rose_gold" | "gunmetal",
    "lens_color_hex": "#RRGGBB or null if clear",
    "lens_type": "clear" | "tinted" | "gradient" | "mirrored",
    "lens_tint_percentage": 0-100,
    "material": "metal" | "plastic" | "acetate" | "titanium" | "mixed",
    "frame_thickness": "thin" | "medium" | "thick" | "bold" | "rimless",
    "style": "vintage" | "modern" | "classic" | "sporty" | "luxury" | "casual" | "retro" | "futuristic" | "minimalist",
    "size": "small" | "medium" | "large" | "oversized",
    "brand_similarity": "ray-ban" | "oakley" | "gucci" | "prada" | "chanel" | "generic" | "vintage" | "designer",
    "overall_aesthetic": "2-4 word description"
}"""

    try:
        # Try new google-genai package first
        from google import genai

        client = genai.Client(api_key=api_key)

        # Load images and prepare content
        contents = [prompt]
        for img_path in image_paths[:4]:
            if os.path.exists(img_path):
                img = Image.open(img_path)
                contents.append(img)

        if len(contents) <= 1:
            return None

        # Call Gemini with new API - try multiple models
        models_to_try = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]
        response = None
        last_error = None

        for model_name in models_to_try:
            try:
                print(f"  Trying model: {model_name}", file=sys.stderr)
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents
                )
                break  # Success, exit loop
            except Exception as model_error:
                last_error = model_error
                if "429" in str(model_error) or "RESOURCE_EXHAUSTED" in str(model_error):
                    print(f"  Rate limited on {model_name}, trying next...", file=sys.stderr)
                    continue
                elif "not found" in str(model_error).lower():
                    print(f"  Model {model_name} not available, trying next...", file=sys.stderr)
                    continue
                else:
                    raise model_error

        if response is None:
            raise last_error or Exception("All Gemini models failed")
        result_text = response.text.strip()

        # Extract JSON
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()

        result = json.loads(result_text)
        print(f"✅ Gemini analysis: shape={result.get('shape')}, material={result.get('material')}", file=sys.stderr)
        return result

    except ImportError:
        # Fallback to old google.generativeai package
        try:
            import google.generativeai as genai_old

            genai_old.configure(api_key=api_key)
            model = genai_old.GenerativeModel('gemini-1.5-flash')

            # Load images
            images = []
            for img_path in image_paths[:4]:
                if os.path.exists(img_path):
                    img = Image.open(img_path)
                    images.append(img)

            if not images:
                return None

            # Call Gemini with old API
            response = model.generate_content([prompt] + images)
            result_text = response.text.strip()

            # Extract JSON
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()

            result = json.loads(result_text)
            print(f"✅ Gemini analysis (old API): shape={result.get('shape')}, material={result.get('material')}", file=sys.stderr)
            return result

        except Exception as e2:
            print(f"Gemini old API also failed: {e2}", file=sys.stderr)
            return None

    except Exception as e:
        print(f"Gemini analysis failed: {e}", file=sys.stderr)
        return None


def analyze_glasses_with_huggingface(image_paths: List[str], api_key: str = None) -> Optional[Dict]:
    """
    Use Hugging Face Inference API (FREE) to analyze glasses images.
    Uses BLIP for image captioning and analysis.
    """
    if not HAS_HUGGINGFACE or not HAS_PIL:
        return None

    api_key = api_key or os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_API_KEY")

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        print(f"🔍 Using Hugging Face with API key (FREE)", file=sys.stderr)
    else:
        print(f"🔍 Using Hugging Face without API key (FREE, slower)", file=sys.stderr)

    try:
        # Load first image
        if not image_paths or not os.path.exists(image_paths[0]):
            return None

        with open(image_paths[0], "rb") as f:
            image_data = f.read()

        # Use BLIP for image understanding
        response = hf_requests.post(
            "https://api-inference.huggingface.co/models/Salesforce/blip-vqa-base",
            headers=headers,
            json={
                "inputs": {
                    "image": base64.b64encode(image_data).decode("utf-8"),
                    "question": "What is the shape of these glasses? Is it round, rectangular, aviator, cat-eye, or other?"
                }
            },
            timeout=30
        )

        if response.status_code == 200:
            result = response.json()
            answer = result[0].get("answer", "").lower() if isinstance(result, list) else ""

            # Parse shape from answer
            shape = "rectangular"  # default
            if "round" in answer or "circular" in answer:
                shape = "round"
            elif "aviator" in answer or "pilot" in answer:
                shape = "aviator"
            elif "cat" in answer:
                shape = "cat_eye"
            elif "square" in answer:
                shape = "square"
            elif "oval" in answer:
                shape = "oval"

            print(f"✅ Hugging Face detected shape: {shape}", file=sys.stderr)

            return {
                "shape": shape,
                "frame_color_name": "black",
                "material": "plastic",
                "style": "classic",
                "frame_thickness": "medium",
                "lens_type": "clear",
                "size": "medium"
            }
        else:
            print(f"Hugging Face API error: {response.status_code}", file=sys.stderr)
            return None

    except Exception as e:
        print(f"Hugging Face analysis failed: {e}", file=sys.stderr)
        return None


def analyze_glasses_with_gpt4(image_paths: List[str], api_key: str = None) -> Optional[Dict]:
    """
    Use GPT-4 Vision (PAID) to analyze glasses images.
    This is used as a fallback if free options fail.
    """
    if not HAS_OPENAI:
        print("OpenAI library not available", file=sys.stderr)
        return None

    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("No OpenAI API key found (optional - paid service)", file=sys.stderr)
        return None

    print(f"Using OpenAI API key (PAID): {api_key[:20]}...{api_key[-4:]}", file=sys.stderr)

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


def find_best_match_vision(image_paths: List[str], remove_bg: bool = True) -> Dict:
    """
    Main matching function - Uses GPT-4 Vision for visual similarity matching.
    Falls back to shape-based matching if GPT-4 is not available.

    Args:
        image_paths: List of paths to uploaded images
        remove_bg: Whether to remove background before analysis (default True)
    """

    # Load available models
    models = load_available_models()
    if not models:
        models = ["3d_glasses.glb"]

    print(f"Loaded {len(models)} available 3D models", file=sys.stderr)

    # Preprocess images (remove background for better analysis)
    if remove_bg:
        print("🖼️ Preprocessing images (removing background)...", file=sys.stderr)
        processed_paths = preprocess_images(image_paths, remove_bg_flag=True)
    else:
        processed_paths = image_paths

    # Extract colors from uploaded images (always needed for 3D model customization)
    color_properties = extract_colors_from_images(processed_paths)
    print(f"Extracted colors: frame={color_properties.get('frameColor')}, "
          f"lens={color_properties.get('lensColor')}", file=sys.stderr)

    # Try AI providers in order of preference
    uploaded_features = None

    # 1. Try Google Gemini (FREE - 1500 req/day) - Best quality when available
    if not uploaded_features and HAS_GEMINI and (os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")):
        print("🔍 Trying Google Gemini (FREE)...", file=sys.stderr)
        uploaded_features = analyze_glasses_with_gemini(processed_paths)

    # 2. Try Local CLIP (NO API NEEDED) - Most reliable, works offline
    if not uploaded_features and HAS_CLIP:
        print("🔍 Trying Local CLIP (NO API NEEDED)...", file=sys.stderr)
        uploaded_features = analyze_glasses_with_clip(processed_paths)

    # 3. Try Hugging Face (FREE - unlimited with rate limits)
    if not uploaded_features and HAS_HUGGINGFACE:
        print("🔍 Trying Hugging Face (FREE)...", file=sys.stderr)
        uploaded_features = analyze_glasses_with_huggingface(processed_paths)

    # 4. Fall back to OpenAI GPT-4 (PAID - only if free options unavailable)
    if not uploaded_features and HAS_OPENAI and os.environ.get("OPENAI_API_KEY"):
        print("🔍 Trying OpenAI GPT-4 Vision (PAID)...", file=sys.stderr)
        uploaded_features = analyze_glasses_with_gpt4(processed_paths)

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
        print("")
        print("Options:")
        print("  --build, --analyze-references  Pre-analyze reference images")
        print("  --no-bg                        Skip background removal")
        print("  --help                         Show this help")
        print("")
        print("AI Providers (in order of preference):")
        print("")
        print("  LOCAL (NO API KEY NEEDED):")
        print("    Local CLIP      - Works offline, no limits ⭐ BEST FALLBACK")
        print("                      Just install: pip install torch transformers")
        print("")
        print("  FREE (API key required):")
        print("    GOOGLE_API_KEY  - Google Gemini (FREE: 1500 req/day)")
        print("                      Get key: https://aistudio.google.com/app/apikey")
        print("    HF_API_KEY      - Hugging Face (FREE: unlimited)")
        print("                      Get key: https://huggingface.co/settings/tokens")
        print("")
        print("  PAID (optional):")
        print("    OPENAI_API_KEY  - OpenAI GPT-4 Vision (paid)")
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

    # Check for --no-bg flag
    remove_bg = "--no-bg" not in sys.argv

    # Run matching
    result = find_best_match_vision(valid_images, remove_bg=remove_bg)
    print(json.dumps(result))

    # Cleanup temp files
    for img in valid_images:
        temp_path = os.path.join(TEMP_DIR, f"nobg_{os.path.basename(img)}")
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


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
