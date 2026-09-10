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
    # Plain `str`, not `EmailStr`: a participant promoted by a PIN Save
    # (B19) keeps its synthetic `@participants.divisi.invalid` address,
    # which is intentionally non-routable and fails email validation.
    email: str
    name: str

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Full replace of the editable profile fields — just `name` for now
    (email changes aren't supported yet: they'd need their own re-
    verification story, out of scope here)."""

    name: str


class ChangePasswordRequest(BaseModel):
    """Password change for an already-logged-in user — distinct from
    `ResetPasswordRequest`'s token-based flow (that one's for someone who
    can't log in at all). Requires the current password rather than just
    trusting the session token alone, so a hijacked-but-not-yet-logged-out
    session can't silently lock the real owner out by changing it."""

    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_min_length(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        return value


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SaveAccountRequest(BaseModel):
    """B19 "Save across devices": attaches a name + PIN credential to the
    caller's anonymous participant row (or, if that name+PIN already maps
    to a saved account, folds the caller into it). `local_id` is the
    client's F23 profile id, used to resolve/mint the anonymous row when
    the device cookie is absent."""

    name: str
    pin: str
    local_id: str | None = None

    @field_validator("pin")
    @classmethod
    def _pin_shape(cls, value: str) -> str:
        if not (4 <= len(value) <= 8) or not value.isdigit():
            raise ValueError("PIN must be 4 to 8 digits")
        return value
