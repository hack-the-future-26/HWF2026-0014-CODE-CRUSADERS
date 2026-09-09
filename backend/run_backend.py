import uvicorn

if __name__ == "__main__":
    print("Starting IDShield AI Backend Service on http://127.0.0.1:8000 ...")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=False)
