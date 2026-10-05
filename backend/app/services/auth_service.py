from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.email import EmailSender
from app.core.errors import Conflict, Unauthorized
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenPair

# Used so login takes similar time whether or not the email exists.
_DUMMY_HASH = security.hash_password("dummy-password-for-timing")


class AuthService:
    def __init__(self, db: Session, email_sender: EmailSender):
        self.db = db
        self.users = UserRepository(db)
        self.email_sender = email_sender

    # ------------------------------------------------------------------
    def _issue_tokens(self, user: User) -> TokenPair:
        access, _, _ = security.create_token(
            str(user.id), security.ACCESS, timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
        )
        refresh, jti, expires_at = security.create_token(
            str(user.id), security.REFRESH, timedelta(days=settings.REFRESH_TOKEN_DAYS)
        )
        self.users.add_refresh_token(user.id, jti, expires_at)
        return TokenPair(access_token=access, refresh_token=refresh)

    # ------------------------------------------------------------------
    def register(self, name: str, email: str, password: str) -> tuple[User, TokenPair]:
        if self.users.get_by_email(email):
            raise Conflict("An account with this email already exists")
        user = self.users.create(name, email, security.hash_password(password))
        tokens = self._issue_tokens(user)
        self.db.commit()
        return user, tokens

    def login(self, email: str, password: str) -> tuple[User, TokenPair]:
        user = self.users.get_by_email(email)
        if user is None:
            security.verify_password(password, _DUMMY_HASH)
            raise Unauthorized("Incorrect email or password")
        if not security.verify_password(password, user.password_hash) or not user.is_active:
            raise Unauthorized("Incorrect email or password")
        tokens = self._issue_tokens(user)
        self.db.commit()
        return user, tokens

    def refresh(self, refresh_token: str) -> TokenPair:
        payload = security.decode_token(refresh_token, security.REFRESH)
        stored = self.users.get_refresh_token(payload["jti"])
        if stored is None:
            raise Unauthorized("Invalid refresh token")
        if stored.revoked_at is not None:
            # A revoked token being replayed suggests theft: kill every session for the user.
            self.users.revoke_all_refresh_tokens(stored.user_id)
            self.db.commit()
            raise Unauthorized("Refresh token has been revoked")
        user = self.users.get_by_id(stored.user_id)
        if user is None or not user.is_active:
            raise Unauthorized("Account unavailable")
        self.users.revoke_refresh_token(stored)  # rotation: one use only
        tokens = self._issue_tokens(user)
        self.db.commit()
        return tokens

    def logout(self, refresh_token: str) -> None:
        try:
            payload = security.decode_token(refresh_token, security.REFRESH)
        except Unauthorized:
            return  # already invalid: nothing to revoke
        stored = self.users.get_refresh_token(payload["jti"])
        if stored and stored.revoked_at is None:
            self.users.revoke_refresh_token(stored)
            self.db.commit()

    # ------------------------------------------------------------------
    def forgot_password(self, email: str) -> None:
        """Always succeeds from the caller's view, so emails cannot be enumerated."""
        user = self.users.get_by_email(email)
        if user is None or not user.is_active:
            return
        token, _, _ = security.create_token(
            str(user.id),
            security.RESET,
            timedelta(minutes=settings.RESET_TOKEN_MINUTES),
            extra={"pwd": security.password_fingerprint(user.password_hash)},
        )
        url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        self.email_sender.send_password_reset(user.email, url)

    def reset_password(self, token: str, new_password: str) -> None:
        payload = security.decode_token(token, security.RESET)
        user = self.users.get_by_id(int(payload["sub"]))
        if user is None or payload.get("pwd") != security.password_fingerprint(user.password_hash):
            raise Unauthorized("Invalid or expired reset token")  # also covers already-used tokens
        user.password_hash = security.hash_password(new_password)
        user.updated_at = datetime.now(UTC)
        self.users.revoke_all_refresh_tokens(user.id)  # force re-login everywhere
        self.db.commit()
