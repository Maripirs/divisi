from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import (
    annotations,
    auth,
    carpool,
    group_resources,
    groups,
    guest,
    homework,
    library,
    omr,
    piece_markup,
    piece_rehearsal_notes,
    responsibilities,
    teams,
    weekly_notes,
)
from app.core.config import get_settings
from app.core.security import decode_token_scope

app = FastAPI(title="Divisi Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def block_admin_preview_writes(request: Request, call_next):
    """B20: the public demo's "preview Admin" session (`create_
    admin_preview_token`) is a real admin session for every read, but must
    never actually change anything. Centralized here rather than in each
    route so no future admin-only endpoint can forget the guard: any
    non-GET/HEAD/OPTIONS request carrying a bearer token whose `scope` is
    `admin_preview` is rejected before it reaches its handler. A normal
    member/admin token has no `scope` claim at all, so this never affects
    a real session."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:]
            if decode_token_scope(token) == "admin_preview":
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "PREVIEW_READ_ONLY: This is a live demo preview. Nothing you do here is saved."
                    },
                )
    return await call_next(request)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(omr.router)
app.include_router(library.router)
app.include_router(annotations.router)
app.include_router(piece_markup.router)
app.include_router(piece_rehearsal_notes.router)
app.include_router(guest.router)
app.include_router(homework.router)
app.include_router(responsibilities.router)
app.include_router(weekly_notes.router)
app.include_router(carpool.router)
app.include_router(group_resources.router)
app.include_router(teams.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
