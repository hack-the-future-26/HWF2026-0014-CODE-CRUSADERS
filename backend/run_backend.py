import os
import sys
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == "__main__":
    print("Starting IDShield AI Backend Service on http://0.0.0.0:8000 ...")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=False)

