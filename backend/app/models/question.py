import enum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Category(str, enum.Enum):
    DSA = "DSA"
    SQL = "SQL"
    DBMS = "DBMS"
    OS = "OS"
    CN = "CN"
    OOP = "OOP"
    PROGRAMMING = "PROGRAMMING"
    SYSTEM_DESIGN = "SYSTEM_DESIGN"


class Difficulty(str, enum.Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    CODING = "CODING"
    SQL = "SQL"
    SHORT_ANSWER = "SHORT_ANSWER"


class Question(TimestampMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("time_limit IS NULL OR time_limit > 0", name="ck_questions_time_limit_pos"),
        Index("ix_questions_category_difficulty", "category", "difficulty"),
        Index("ix_questions_type", "question_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[Category] = mapped_column(Enum(Category, native_enum=False, length=20), nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, native_enum=False, length=10), nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, native_enum=False, length=20), nullable=False
    )
    time_limit: Mapped[int | None] = mapped_column(Integer)  # seconds
    # CODING only: {"python": "def solve(...): ...", "java": "class Solution {...}"}
    starter_code: Mapped[dict | None] = mapped_column(JSON)
    # CODING only: examples + constraints shown to the user
    examples: Mapped[list | None] = mapped_column(JSON)
    constraints: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)  # shown after answering
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    tags: Mapped[list["QuestionTag"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )
    options: Mapped[list["McqOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", order_by="McqOption.position"
    )
    test_cases: Mapped[list["CodingTestCase"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )
    sql_challenge: Mapped["SqlChallenge | None"] = relationship(
        back_populates="question", cascade="all, delete-orphan", uselist=False
    )
    reference_answer: Mapped["ReferenceAnswer | None"] = relationship(
        back_populates="question", cascade="all, delete-orphan", uselist=False
    )


class QuestionTag(Base):
    __tablename__ = "question_tags"
    __table_args__ = (
        UniqueConstraint("question_id", "tag", name="uq_question_tag"),
        Index("ix_question_tags_tag", "tag"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    tag: Mapped[str] = mapped_column(String(50), nullable=False)

    question: Mapped[Question] = relationship(back_populates="tags")


class McqOption(Base):
    __tablename__ = "mcq_options"
    __table_args__ = (Index("ix_mcq_options_question_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    question: Mapped[Question] = relationship(back_populates="options")


class CodingTestCase(Base):
    __tablename__ = "coding_test_cases"
    __table_args__ = (Index("ix_coding_test_cases_question_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    input_data: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # hidden unless True

    question: Mapped[Question] = relationship(back_populates="test_cases")


class SqlChallenge(Base):
    """Controlled dataset + reference query for a SQL question.
    Never sent to the frontend; evaluated server-side in an isolated schema."""

    __tablename__ = "sql_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    schema_sql: Mapped[str] = mapped_column(Text, nullable=False)
    seed_sql: Mapped[str] = mapped_column(Text, nullable=False)
    solution_query: Mapped[str] = mapped_column(Text, nullable=False)
    order_matters: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    question: Mapped[Question] = relationship(back_populates="sql_challenge")


class ReferenceAnswer(Base):
    """Reference concepts for deterministic short-answer evaluation (TF-IDF / keyword coverage)."""

    __tablename__ = "reference_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    model_answer: Mapped[str] = mapped_column(Text, nullable=False)
    # [{"concept": "deadlock", "keywords": ["circular wait", "mutual exclusion"], "weight": 2}]
    concepts: Mapped[list] = mapped_column(JSON, nullable=False)

    question: Mapped[Question] = relationship(back_populates="reference_answer")
