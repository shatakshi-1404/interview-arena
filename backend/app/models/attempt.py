import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AttemptMode(str, enum.Enum):
    PRACTICE = "PRACTICE"
    ASSESSMENT = "ASSESSMENT"
    MOCK_INTERVIEW = "MOCK_INTERVIEW"


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    EXPIRED = "EXPIRED"  # auto-submitted on timeout


class SubmissionStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    WRONG_ANSWER = "WRONG_ANSWER"
    RUNTIME_ERROR = "RUNTIME_ERROR"
    TIME_LIMIT_EXCEEDED = "TIME_LIMIT_EXCEEDED"
    COMPILE_ERROR = "COMPILE_ERROR"


class Attempt(Base):
    """One sitting: an assessment, a mock interview, or a single practice question."""

    __tablename__ = "attempts"
    __table_args__ = (
        Index("ix_attempts_user_started", "user_id", "started_at"),
        # One in-progress attempt per user per assessment, and one in-progress mock interview per user.
        Index("uq_attempts_one_active_assessment", "user_id", "assessment_id", unique=True,
              postgresql_where=text("status = 'IN_PROGRESS' AND assessment_id IS NOT NULL")),
        Index("uq_attempts_one_active_mock", "user_id", unique=True,
              postgresql_where=text("status = 'IN_PROGRESS' AND mode = 'MOCK_INTERVIEW'")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("assessments.id", ondelete="SET NULL"))
    mode: Mapped[AttemptMode] = mapped_column(Enum(AttemptMode, native_enum=False, length=20), nullable=False)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus, native_enum=False, length=20), default=AttemptStatus.IN_PROGRESS, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # server-side authority
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float | None] = mapped_column(Float)
    meta: Mapped[dict | None] = mapped_column(JSON)  # e.g. mock interview role / level

    answers: Mapped[list["UserAnswer"]] = relationship(back_populates="attempt", cascade="all, delete-orphan")


class UserAnswer(Base):
    __tablename__ = "user_answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question_answer"),
        Index("ix_user_answers_question", "question_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    selected_option_ids: Mapped[list | None] = mapped_column(JSON)
    text_answer: Mapped[str | None] = mapped_column(Text)
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("submissions.id", ondelete="SET NULL"))
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    score: Mapped[float | None] = mapped_column(Float)  # 0..1
    feedback: Mapped[dict | None] = mapped_column(JSON)  # structured evaluation for short answers
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    attempt: Mapped[Attempt] = relationship(back_populates="answers")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_user_question", "user_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    attempt_id: Mapped[int | None] = mapped_column(ForeignKey("attempts.id", ondelete="SET NULL"))
    language: Mapped[str] = mapped_column(String(20), nullable=False)  # python | java | sql
    code: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, native_enum=False, length=25), default=SubmissionStatus.PENDING, nullable=False
    )
    runtime_ms: Mapped[int | None] = mapped_column(Integer)
    memory_kb: Mapped[int | None] = mapped_column(Integer)
    passed_tests: Mapped[int | None] = mapped_column(Integer)
    total_tests: Mapped[int | None] = mapped_column(Integer)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    result_detail: Mapped[dict | None] = mapped_column(JSON)  # expected vs actual for SQL, per-test results for code
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
