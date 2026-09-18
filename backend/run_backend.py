import os
import sys
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 8000))
    print(f"Starting IDShield AI Backend Service on http://0.0.0.0:{PORT} ...")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=PORT, reload=False)

