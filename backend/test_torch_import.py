try:
    import torch
    print("Torch version:", torch.__version__)
    print("CUDA available:", torch.cuda.is_available())
except ImportError as e:
    print("Error importing torch:", e)
    import sys
    sys.exit(1)
