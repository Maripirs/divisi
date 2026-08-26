from fastapi import FastAPI

from app.api.routes import auth, groups, library, omr

app = FastAPI(title="Divisi Backend")

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(omr.router)
app.include_router(library.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
