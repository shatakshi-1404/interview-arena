import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routes import admin, assessments, auth, engagement, mock, progress, questions
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError
from app.ml import readiness

logger = logging.getLogger("interviewarena")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.ML_ENABLED:
        try:
            readiness.train_model()  # ~1s once; keeps the first learner request fast
            logger.info("Readiness model ready")
        except Exception:
            logger.exception("Readiness model warm-up failed; it will be trained on first use")
    yield


app = FastAPI(title="InterviewArena API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.get("/api/health", tags=["meta"])
def health():
    """Liveness: the process is up."""
    return {"status": "ok"}


@app.get("/api/ready", tags=["meta"])
def ready(db: Session = Depends(get_db)):
    """Readiness: the database answers."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Readiness check failed")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(questions.router)
app.include_router(assessments.router)
app.include_router(assessments.attempts_router)
app.include_router(progress.router)
app.include_router(mock.router)
app.include_router(engagement.router)
app.include_router(admin.router)
