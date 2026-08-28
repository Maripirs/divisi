from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    annotations,
    auth,
    groups,
    guest,
    homework,
    library,
    omr,
    responsibilities,
    weekly_notes,
)
from app.core.config import get_settings

app = FastAPI(title="Divisi Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(omr.router)
app.include_router(library.router)
app.include_router(annotations.router)
app.include_router(guest.router)
app.include_router(homework.router)
app.include_router(responsibilities.router)
app.include_router(weekly_notes.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
