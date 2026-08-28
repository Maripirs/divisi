"""Registration, login, password reset, and OAuth-status shapes."""

from pydantic import BaseModel, EmailStr, field_validator

# Shared by registration and password reset — deliberately just a length
# floor, not a composition rule (no forced digit/symbol/etc.), matching
# current guidance that length matters far more than artificial complexity
# rules people just work around with predictable substitutions.
MIN_PASSWORD_LENGTH = 8


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

    @field_validator("password")
    @classmethod
    def _password_min_length(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_min_length(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        return value


class OAuthProviderStatusOut(BaseModel):
    """Which sign-in providers are actually usable right now — the
    Frontend only shows a "Continue with X" button when its entry here is
    `true`, so an unconfigured provider (no real credentials yet) simply
    doesn't appear rather than offering a button that would 501."""

    google: bool
    apple: bool


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
