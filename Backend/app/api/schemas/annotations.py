"""Per-piece annotation + peer-sharing shapes."""

from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.core.emails import NormalizedEmail


class AnnotationCreate(BaseModel):
    piece_id: str
    position: str
    content: str


class AnnotationUpdate(BaseModel):
    position: str | None = None
    content: str | None = None


class AnnotationOut(BaseModel):
    id: str
    user_id: str
    piece_id: str
    position: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AnnotationShareCreate(BaseModel):
    email: NormalizedEmail


class AnnotationShareOut(BaseModel):
    annotation_id: str
    shared_with_user_id: str
    email: EmailStr
