from fastapi import APIRouter, Depends, status

from app.api.deps import get_auth_service, get_current_user
from app.core.ratelimit import limit_by_ip
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
    UserOut,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_by_ip("register", 10, 600))])
def register(body: RegisterRequest, svc: AuthService = Depends(get_auth_service)):
    user, tokens = svc.register(body.name, body.email, body.password)
    return AuthResponse(user=UserOut.model_validate(user), tokens=tokens)


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(limit_by_ip("login", 10, 60))])
def login(body: LoginRequest, svc: AuthService = Depends(get_auth_service)):
    user, tokens = svc.login(body.email, body.password)
    return AuthResponse(user=UserOut.model_validate(user), tokens=tokens)


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(limit_by_ip("refresh", 30, 60))])
def refresh(body: RefreshRequest, svc: AuthService = Depends(get_auth_service)):
    return svc.refresh(body.refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout(body: RefreshRequest, svc: AuthService = Depends(get_auth_service)):
    svc.logout(body.refresh_token)
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(limit_by_ip("forgot", 5, 900))])
def forgot_password(body: ForgotPasswordRequest, svc: AuthService = Depends(get_auth_service)):
    svc.forgot_password(body.email)
    return MessageResponse(message="If that email is registered, a reset link has been sent")


@router.post("/reset-password", response_model=MessageResponse, dependencies=[Depends(limit_by_ip("reset", 10, 900))])
def reset_password(body: ResetPasswordRequest, svc: AuthService = Depends(get_auth_service)):
    svc.reset_password(body.token, body.new_password)
    return MessageResponse(message="Password updated. Please log in again")
