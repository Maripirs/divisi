"""One canonical spelling for every email address the Backend stores or
looks up.

Email lookups (`User.email == ...`) are exact matches, and pydantic's
`EmailStr` only lowercases the domain, so "Bob@Example.com" and
"bob@example.com" used to be two different accounts: a member who
registered with a capital letter couldn't log in typing it lowercase, and
could register a second time. Every address is lowercased and stripped on
the way in instead (schemas use `NormalizedEmail`; the OAuth callback,
whose address comes from the provider rather than a request body, calls
`normalize_email` directly), so both writes and lookups agree.
"""

from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, EmailStr


def normalize_email(value: str) -> str:
    return value.strip().lower()


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


NormalizedEmail = Annotated[EmailStr, BeforeValidator(_strip), AfterValidator(normalize_email)]
