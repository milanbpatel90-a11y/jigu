try:
    import torch

    print("Torch version:", torch.__version__)
    from transformers import CLIPProcessor, CLIPModel

    print("Transformers imported successfully")
    from PIL import Image

    print("Pillow imported successfully")
except ImportError as e:
    print("Error importing:", e)
    import sys

    sys.exit(1)
except Exception as e:
    print("Unexpected error:", e)
    import sys

    sys.exit(1)
