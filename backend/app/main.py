from fastapi import FastAPI


app = FastAPI(
    title="AI-Powered Cloud Cost & Architecture Calculator API",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Backend is running locally on port 8003."}
