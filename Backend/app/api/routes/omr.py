"""OMR routes. Upload + job status endpoints land in B6 — see Backend/plan.md."""

from fastapi import APIRouter

router = APIRouter(prefix="/omr", tags=["omr"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "omr stub — see B6 in plan.md"}
