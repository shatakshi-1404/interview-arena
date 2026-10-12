import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AiKind(str, enum.Enum):
    HINT = "HINT"
    FEEDBACK = "FEEDBACK"  # LLM feedback on a short answer
    GENERATE = "GENERATE"  # admin question drafting


class AiInteraction(Base):
    """Audit log + usage meter for every LLM call (also the source of the per-user daily cap and feedback cache)."""

    __tablename__ = "ai_interactions"
    __table_args__ = (
        Index("ix_ai_user_created", "user_id", "created_at"),
        Index("ix_ai_user_question_kind", "user_id", "question_id", "kind"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"))
    user_answer_id: Mapped[int | None] = mapped_column(ForeignKey("user_answers.id", ondelete="SET NULL"))
    kind: Mapped[AiKind] = mapped_column(Enum(AiKind, native_enum=False, length=20), nullable=False)
    level: Mapped[int | None] = mapped_column(Integer)  # hint level 1..3
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    output: Mapped[dict | None] = mapped_column(JSON)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
