from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.ml import features as F
from app.ml import readiness, recommender
from app.models.analytics import Recommendation
from app.models.question import Category
from app.models.user import User
from app.repositories.performance_repository import PerformanceRepository
from app.schemas.progress import (
    ActivityResponse,
    DayPoint,
    DifficultyStat,
    ModelInfo,
    ProgressOverview,
    ReadinessDetail,
    ReadinessSummary,
    ReadinessTopic,
    RecommendationList,
    RecommendationOut,
    RecQuestion,
    TopicBrief,
    TopicsResponse,
    TopicStat,
    WeakTopicOut,
    WeekPoint,
)

DISCLAIMER = (
    "Practice Readiness reflects how you perform on this platform. "
    "It is not a prediction of interview or job outcomes."
)
MODEL_INFO = ModelInfo(
    type="Multinomial logistic regression over 6 transparent features",
    trained_on="Synthetic practice profiles labelled by a published rubric (no real hiring data)",
    validated_against_real_outcomes=False,
    version=readiness.MODEL_VERSION,
)


def _pct(x: float | None, nd: int = 1) -> float | None:
    return None if x is None else round(x * 100, nd)


class PerformanceService:
    def __init__(self, db: Session, *, ml_enabled: bool = True, coding_available: bool = False):
        self.db = db
        self.repo = PerformanceRepository(db)
        self.ml_enabled = ml_enabled
        self.coding_available = coding_available

    # --------------------------------------------------------------- helpers
    def _topic_stat(self, key: str, lab: str, s: F.GroupStats | None, tr: readiness.TopicReadiness | None = None) -> TopicStat:
        if s is None:
            return TopicStat(key=key, label=lab, attempts=0, correct=0, accuracy=None, recent_accuracy=None,
                             trend_points=None, avg_time_seconds=None, last_practiced=None,
                             readiness_score=tr.score if tr else None, confidence=tr.confidence if tr else None)
        return TopicStat(
            key=key, label=lab, attempts=s.attempts, correct=s.correct, accuracy=_pct(s.accuracy),
            recent_accuracy=_pct(s.recent_accuracy), trend_points=_pct(s.trend),
            avg_time_seconds=round(s.avg_time_seconds, 1) if s.avg_time_seconds is not None else None,
            last_practiced=s.last_attempt,
            readiness_score=tr.score if tr else None, confidence=tr.confidence if tr else None,
        )

    def _weak_out(self, w: recommender.WeakTopic) -> WeakTopicOut:
        return WeakTopicOut(category=Category(w.category), label=recommender.label(w.category), attempts=w.attempts,
                            accuracy=_pct(w.accuracy), recent_accuracy=_pct(w.recent_accuracy),
                            severity=w.severity, reasons=list(w.reasons))

    def _readiness_summary(self, events) -> ReadinessSummary:
        needed = readiness.MIN_QUESTIONS
        if not self.ml_enabled:
            return ReadinessSummary(status="DISABLED", answered=len(events), needed=needed)
        feats = F.readiness_features(events)
        if feats is None or feats.answered < needed:
            return ReadinessSummary(status="INSUFFICIENT_DATA", answered=len(events), needed=needed)
        pred = readiness.predict(feats)
        return ReadinessSummary(status="READY_TO_SCORE", score=pred.score, category=pred.category,
                                answered=feats.answered, needed=needed)

    # -------------------------------------------------------------- overview
    def overview(self, user: User, tz: int) -> ProgressOverview:
        now = datetime.now(UTC)
        events = self.repo.events(user.id)
        today = F.local_day(now, tz)
        activity = F.daily_activity(events, tz)
        current, longest = F.streaks(set(activity), today)

        cats = F.group_stats(events, lambda e: e.category)
        eligible = [s for s in cats.values() if s.attempts >= F.MIN_TOPIC_ATTEMPTS]
        weakest = min(eligible, key=lambda s: (s.smoothed_accuracy, s.key)) if eligible else None
        diffs = F.group_stats(events, lambda e: e.difficulty)

        return ProgressOverview(
            current_streak=current,
            longest_streak=longest,
            problems_solved=len(F.solved_question_ids(events)),
            total_answered=len(events),
            accuracy=_pct(F.accuracy(events)),
            average_score=_pct(F.mean_score(events)),
            avg_solve_time_seconds=(round(t, 1) if (t := F.avg_time_seconds(events)) is not None else None),
            consistency=F.consistency(events),
            weakest_topic=(
                TopicBrief(key=weakest.key, label=recommender.label(weakest.key), accuracy=_pct(weakest.accuracy))
                if weakest else None
            ),
            readiness=self._readiness_summary(events),
            performance_over_time=[DayPoint(**r) for r in F.daily_series(activity, today - timedelta(days=29), today)],
            weekly=[WeekPoint(**r) for r in F.weekly_series(activity, today)],
            by_difficulty=[
                DifficultyStat(
                    difficulty=d,
                    attempts=diffs[d].attempts if d in diffs else 0,
                    correct=diffs[d].correct if d in diffs else 0,
                    accuracy=_pct(diffs[d].accuracy) if d in diffs else None,
                    avg_time_seconds=(round(diffs[d].avg_time_seconds, 1)
                                      if d in diffs and diffs[d].avg_time_seconds is not None else None),
                )
                for d in F.DIFFICULTIES
            ],
        )

    # ---------------------------------------------------------------- topics
    def topics(self, user: User) -> TopicsResponse:
        events = self.repo.events(user.id)
        cats = F.group_stats(events, lambda e: e.category)
        tags = F.group_stats(events, lambda e: e.tags)
        tr = {t.category: t for t in readiness.topic_readiness(events)} if self.ml_enabled else {}
        top_tags = sorted(tags.values(), key=lambda s: (-s.attempts, s.key))[:30]
        weak = recommender.detect_weak_topics(events) if self.ml_enabled else []
        return TopicsResponse(
            categories=[self._topic_stat(c, recommender.label(c), cats.get(c), tr.get(c)) for c in F.CATEGORIES],
            tags=[self._topic_stat(s.key, s.key, s) for s in top_tags],
            weak_topics=[self._weak_out(w) for w in weak],
        )

    # -------------------------------------------------------------- activity
    def activity(self, user: User, days: int, tz: int) -> ActivityResponse:
        today = F.local_day(datetime.now(UTC), tz)
        events = self.repo.events(user.id)
        activity = F.daily_activity(events, tz)
        current, longest = F.streaks(set(activity), today)
        series = F.daily_series(activity, today - timedelta(days=days - 1), today)
        return ActivityResponse(
            days=[DayPoint(**r) for r in series],
            current_streak=current,
            longest_streak=longest,
            active_days=sum(1 for r in series if r["answered"]),
            total_answered=sum(r["answered"] for r in series),
        )

    # ------------------------------------------------------------- readiness
    def readiness(self, user: User) -> ReadinessDetail:
        events = self.repo.events(user.id)
        summary = self._readiness_summary(events)
        base = dict(status=summary.status, answered=summary.answered, needed=summary.needed,
                    disclaimer=DISCLAIMER, model=MODEL_INFO)
        if summary.status == "DISABLED":
            return ReadinessDetail(**base)

        weak = recommender.detect_weak_topics(events)
        topics = readiness.topic_readiness(events)
        untouched = [t.category for t in topics if t.attempts == 0]
        detail = dict(
            base,
            topics=[ReadinessTopic(category=Category(t.category), label=recommender.label(t.category), score=t.score,
                                   attempts=t.attempts, confidence=t.confidence) for t in topics],
            strengths=[recommender.label(t.category) for t in topics
                       if t.score is not None and t.attempts >= 5 and t.score >= 75],
            weaknesses=[self._weak_out(w) for w in weak],
            recent_improvement=F.period_comparison(events, datetime.now(UTC)),
            next_steps=recommender.next_steps(weak, untouched, len(events)),
        )
        if summary.status == "INSUFFICIENT_DATA":
            return ReadinessDetail(**detail)

        pred = readiness.predict(F.readiness_features(events))
        return ReadinessDetail(**detail, score=pred.score, category=pred.category,
                               rubric_category=pred.rubric_category, probabilities=pred.probabilities,
                               drivers=pred.drivers)

    # ------------------------------------------------------- recommendations
    def _out(self, rows) -> list[RecommendationOut]:
        return [
            RecommendationOut(
                id=r.id, priority=r.priority, reason=r.reason, created_at=r.created_at,
                question=RecQuestion(id=q.id, title=q.title, category=q.category, difficulty=q.difficulty,
                                     question_type=q.question_type),
            )
            for r, q in rows
        ]

    def _regenerate(self, user: User, events) -> None:
        recs = recommender.recommend(
            events,
            self.repo.candidates(include_coding=self.coding_available),
            dismissed_ids=frozenset(self.repo.recently_dismissed_question_ids(user.id)),
        )
        self.repo.clear_active(user.id)
        self.db.add_all([
            Recommendation(user_id=user.id, question_id=r.question_id, category=Category(r.category),
                           priority=r.priority, reason=r.reason)
            for r in recs
        ])
        self.db.commit()

    def recommendations(self, user: User) -> RecommendationList:
        if not self.ml_enabled:
            return RecommendationList(enabled=False, items=[])
        events = self.repo.events(user.id)
        rows = self.repo.active_recommendations(user.id)
        latest = events[-1].created_at if events else None
        fresh = bool(rows) and all(q.is_published for _, q in rows) and (
            latest is None or max(r.created_at for r, _ in rows) >= latest
        )
        if not fresh:
            self._regenerate(user, events)
            rows = self.repo.active_recommendations(user.id)
        return RecommendationList(enabled=True, items=self._out(rows))

    def dismiss(self, user: User, rec_id: int) -> RecommendationList:
        rec = self.repo.get_recommendation(rec_id, user.id)
        if rec is None:
            raise NotFound("Recommendation not found")
        rec.is_dismissed = True
        self.db.commit()
        self._regenerate(user, self.repo.events(user.id))
        return RecommendationList(enabled=True, items=self._out(self.repo.active_recommendations(user.id)))
