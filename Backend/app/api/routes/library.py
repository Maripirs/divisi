"""Library routes (pieces, versions, distribution, annotations).

Land across B3–B5 — see Backend/plan.md.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/library", tags=["library"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "library stub — see B3-B5 in plan.md"}
