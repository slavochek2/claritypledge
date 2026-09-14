import os
import sys

# The service modules import each other by bare name (as in the container's /app), so the
# service directory goes on the path. Only pure modules are imported by these tests — no
# FastAPI, GCS or Supabase client is needed to run them.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
