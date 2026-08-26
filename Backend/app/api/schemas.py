"""Pydantic request/response models for the API."""

from pydantic import BaseModel, EmailStr

from app.db.models import GroupRole


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GroupCreate(BaseModel):
    name: str


class GroupOut(BaseModel):
    id: str
    name: str
    role: GroupRole  # the requesting user's role in this group

    model_config = {"from_attributes": True}


class GroupMemberAdd(BaseModel):
    email: EmailStr
    role: GroupRole = GroupRole.member


class GroupMemberOut(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    role: GroupRole

    model_config = {"from_attributes": True}
