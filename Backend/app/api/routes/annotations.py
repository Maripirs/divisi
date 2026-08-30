"""Annotation routes: a user's private notes on a piece, with explicit peer sharing.

An annotation is invisible to everyone but its owner by default. The owner
can share it with a specific user (by email); a shared annotation becomes
visible to that peer on read, but only the owner can edit, delete, share, or
unshare it. See the domain model in Backend/plan.md.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    AnnotationCreate,
    AnnotationOut,
    AnnotationShareCreate,
    AnnotationShareOut,
    AnnotationUpdate,
)
from app.db.models import Annotation, AnnotationShare, GroupMembership, OwnerType, Piece, User
from app.db.session import get_db

router = APIRouter(prefix="/annotations", tags=["annotations"])


def _get_piece_or_404(piece_id: str, db: Session) -> Piece:
    piece = db.get(Piece, piece_id)
    if piece is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found")
    return piece


def _can_access_piece(piece: Piece, user: User, db: Session) -> bool:
    """Can this user see the piece at all (owner, or member of its owning group)?"""
    if piece.owner_type == OwnerType.user:
        return piece.owner_id == user.id
    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == piece.owner_id, GroupMembership.user_id == user.id)
        .first()
    )
    return membership is not None


def _get_annotation_or_404(annotation_id: str, db: Session) -> Annotation:
    annotation = db.get(Annotation, annotation_id)
    if annotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    return annotation


def _can_view_annotation(annotation: Annotation, user: User, db: Session) -> bool:
    if annotation.user_id == user.id:
        return True
    share = (
        db.query(AnnotationShare)
        .filter(AnnotationShare.annotation_id == annotation.id, AnnotationShare.shared_with_user_id == user.id)
        .first()
    )
    return share is not None


def _require_owner(annotation: Annotation, user: User) -> None:
    if annotation.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can do this")


@router.post("", response_model=AnnotationOut, status_code=status.HTTP_201_CREATED)
def create_annotation(
    payload: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnotationOut:
    piece = _get_piece_or_404(payload.piece_id, db)
    if not _can_access_piece(piece, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this piece")
    annotation = Annotation(
        user_id=current_user.id, piece_id=piece.id, position=payload.position, content=payload.content
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.get("", response_model=list[AnnotationOut])
def list_annotations(
    piece_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AnnotationOut]:
    """Annotations on a piece visible to the caller: their own, plus any shared with them."""
    _get_piece_or_404(piece_id, db)
    own = (
        db.query(Annotation)
        .filter(Annotation.piece_id == piece_id, Annotation.user_id == current_user.id)
        .all()
    )
    shared = (
        db.query(Annotation)
        .join(AnnotationShare, AnnotationShare.annotation_id == Annotation.id)
        .filter(Annotation.piece_id == piece_id, AnnotationShare.shared_with_user_id == current_user.id)
        .all()
    )
    return sorted(own + shared, key=lambda a: a.created_at)


@router.get("/{annotation_id}", response_model=AnnotationOut)
def get_annotation(
    annotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnotationOut:
    annotation = _get_annotation_or_404(annotation_id, db)
    if not _can_view_annotation(annotation, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not visible to you")
    return annotation


@router.patch("/{annotation_id}", response_model=AnnotationOut)
def update_annotation(
    annotation_id: str,
    payload: AnnotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnotationOut:
    annotation = _get_annotation_or_404(annotation_id, db)
    _require_owner(annotation, current_user)
    if payload.position is not None:
        annotation.position = payload.position
    if payload.content is not None:
        annotation.content = payload.content
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    annotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    annotation = _get_annotation_or_404(annotation_id, db)
    _require_owner(annotation, current_user)
    db.delete(annotation)
    db.commit()


@router.get("/{annotation_id}/shares", response_model=list[AnnotationShareOut])
def list_annotation_shares(
    annotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AnnotationShareOut]:
    """Who an annotation is currently shared with — owner-only, same as any
    other management action on it (share/unshare/edit/delete)."""
    annotation = _get_annotation_or_404(annotation_id, db)
    _require_owner(annotation, current_user)
    shares = db.query(AnnotationShare).filter(AnnotationShare.annotation_id == annotation.id).all()
    if not shares:
        return []
    user_ids = [s.shared_with_user_id for s in shares]
    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    return [
        AnnotationShareOut(
            annotation_id=annotation.id,
            shared_with_user_id=s.shared_with_user_id,
            email=users_by_id[s.shared_with_user_id].email,
        )
        for s in shares
        if s.shared_with_user_id in users_by_id
    ]


@router.post("/{annotation_id}/share", response_model=AnnotationShareOut, status_code=status.HTTP_201_CREATED)
def share_annotation(
    annotation_id: str,
    payload: AnnotationShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnotationShareOut:
    annotation = _get_annotation_or_404(annotation_id, db)
    _require_owner(annotation, current_user)
    target = db.query(User).filter(User.email == payload.email).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user with that email")
    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot share with yourself")
    existing = (
        db.query(AnnotationShare)
        .filter(AnnotationShare.annotation_id == annotation.id, AnnotationShare.shared_with_user_id == target.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already shared with this user")
    db.add(AnnotationShare(annotation_id=annotation.id, shared_with_user_id=target.id))
    db.commit()
    return AnnotationShareOut(annotation_id=annotation.id, shared_with_user_id=target.id, email=target.email)


@router.delete("/{annotation_id}/share/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unshare_annotation(
    annotation_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    annotation = _get_annotation_or_404(annotation_id, db)
    _require_owner(annotation, current_user)
    share = (
        db.query(AnnotationShare)
        .filter(AnnotationShare.annotation_id == annotation.id, AnnotationShare.shared_with_user_id == user_id)
        .first()
    )
    if share is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not shared with this user")
    db.delete(share)
    db.commit()
