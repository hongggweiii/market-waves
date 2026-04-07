import sys
import os

# Make the root directory importable so main.py can be found
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: F401  — Vercel picks up the `app` ASGI object
