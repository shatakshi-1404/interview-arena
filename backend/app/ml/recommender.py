"""Deterministic, explainable recommendations from a user's history. No network, no LLM."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass

from app.ml import features as F

LABELS = {
    "DSA": "DSA", "SQL": "SQL", "DBMS": "DBMS", "OS": "OS", "CN": "CN", "OOP": "OOP",
    "PROGRAMMING": "Programming", "SYSTEM_DESIGN": "System Design",
}


def label(category: str) -> str:
    return LABELS.get(category, category.title())


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


@dataclass(frozen=True)
class Candidate:
    id: int
    title: str
    category: str
    difficulty: str
    question_type: str
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class WeakTopic:
    category: str
    attempts: int
    accuracy: float
    recent_accuracy: float
    recent_n: int
    trend: float | None
    avg_time_ratio: float | None
    severity: float  # 0..1
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class Recommendation:
    question_id: int
    category: str
    difficulty: str
    priority: int  # 1 = do first
    score: float
    reason: str


# ------------------------------------------------------------ weak topics
def detect_weak_topics(events) -> list[WeakTopic]:
    """A topic needs >= 3 attempts, then is flagged for low accuracy, a recent drop, or slowness."""
    out: list[WeakTopic] = []
    for cat, s in F.group_stats(events, lambda e: e.category).items():
        if s.attempts < F.MIN_TOPIC_ATTEMPTS:
            continue
        lab = label(cat)
        drop = max(0.0, -s.trend) if s.trend is not None else 0.0
        ratio = s.avg_time_ratio or 0.0
        low_acc = s.smoothed_accuracy < 0.6
        falling = drop >= 0.15
        slow = ratio > 1.2 and s.smoothed_accuracy < 0.8
        if not (low_acc or falling or slow):
            continue
        reasons: list[str] = []
        if low_acc:
            if s.recent_n >= 3 and s.recent_accuracy < 0.6:
                reasons.append(f"Your recent {lab} accuracy is {_pct(s.recent_accuracy)}.")
            else:
                reasons.append(f"You've answered {s.correct} of {s.attempts} {lab} questions correctly ({_pct(s.accuracy)}).")
        if falling:
            reasons.append(f"Your {lab} accuracy fell from {_pct(s.previous_accuracy)} to {_pct(s.recent_accuracy)} recently.")
        if slow:
            reasons.append(f"You use about {ratio:.1f}x the suggested time on {lab} questions.")
        severity = min(
            1.0,
            0.6 * (1 - s.smoothed_accuracy) + 0.25 * min(1.0, drop * 2) + 0.15 * min(1.0, max(0.0, ratio - 1.0)),
        )
        out.append(
            WeakTopic(cat, s.attempts, s.accuracy, s.recent_accuracy, s.recent_n, s.trend,
                      s.avg_time_ratio, round(severity, 4), tuple(reasons))
        )
    return sorted(out, key=lambda w: (-w.severity, w.category))


# ------------------------------------------------------ difficulty adaptation
def _working_level(events) -> str:
    counts = Counter(e.difficulty for e in events)
    return max(counts, key=lambda d: (counts[d], F.DIFFICULTIES.index(d)))  # ties -> the harder level


def target_difficulty(topic_events, overall_events, lab: str) -> tuple[str, str | None]:
    """Returns (difficulty to practice next, human-readable justification or None)."""
    ev = F.chronological(topic_events)
    if ev:
        last = ev[-F.RECENT_WINDOW:]
        if len(last) >= 3:
            hits = sum(e.is_correct for e in last)
            rate = hits / len(last)
            level = _working_level(last)
            idx = F.DIFFICULTIES.index(level)
            if rate >= 0.8 and idx < len(F.DIFFICULTIES) - 1:
                return F.DIFFICULTIES[idx + 1], f"You solved {hits} of your last {len(last)} {lab} questions."
            if rate <= 0.4 and idx > 0:
                return F.DIFFICULTIES[idx - 1], f"You got {hits} of your last {len(last)} {lab} questions right."
            return level, None
        return ev[-1].difficulty, None
    recent = F.chronological(overall_events)[-10:]
    if len(recent) >= 5 and sum(e.is_correct for e in recent) / len(recent) >= 0.8:
        return "MEDIUM", None
    return "EASY", None


# ------------------------------------------------------------ recommending
@dataclass
class _Scored:
    score: float
    cand: Candidate
    kind: str  # weak | explore | maintain
    target: str
    why: str | None
    retry: bool
    tag_hit: list[str]


def _baseline(pool: list[Candidate], limit: int) -> list[Recommendation]:
    by_cat: dict[str, list[Candidate]] = defaultdict(list)
    for c in sorted(pool, key=lambda c: (F.DIFFICULTIES.index(c.difficulty), c.id)):
        by_cat[c.category].append(c)
    picks = [by_cat[cat][0] for cat in F.CATEGORIES if cat in by_cat][:limit]
    return [
        Recommendation(c.id, c.category, c.difficulty, i + 1, 0.0,
                       f"Start here to build your {label(c.category)} baseline.")
        for i, c in enumerate(picks)
    ]


def _reason(s: _Scored, weak: dict[str, WeakTopic], stats: dict[str, F.GroupStats]) -> str:
    c, lab = s.cand, label(s.cand.category)
    if s.kind == "weak":
        parts = [weak[c.category].reasons[0]]
    elif s.kind == "explore":
        parts = [f"You haven't practiced {lab} yet."]
    else:
        parts = [f"Keep {lab} sharp: your accuracy there is {_pct(stats[c.category].accuracy)}."]
    if c.difficulty == s.target:
        parts.append(f"{s.why} Next up: {c.difficulty.title()}." if s.why else f"Matched to your current level ({c.difficulty.title()}).")
    else:
        parts.append(f"This is a {c.difficulty.title()} question; your current target level is {s.target.title()}.")
    if s.retry:
        parts.append("You attempted this one before without solving it.")
    if s.tag_hit:
        parts.append(f"It covers {s.tag_hit[0]}, which you missed recently.")
    return " ".join(parts)


def recommend(events, candidates: list[Candidate], *, limit: int = 6, per_category: int = 3,
              dismissed_ids=frozenset()) -> list[Recommendation]:
    ev = F.chronological(events)
    solved = F.solved_question_ids(ev)
    attempted = F.attempted_question_ids(ev)
    pool = [c for c in candidates if c.id not in solved and c.id not in dismissed_ids]
    if not pool:
        return []
    if not ev:
        return _baseline(pool, limit)

    stats = F.group_stats(ev, lambda e: e.category)
    weak = {w.category: w for w in detect_weak_topics(ev)}
    by_cat: dict[str, list[F.Event]] = defaultdict(list)
    for e in ev:
        by_cat[e.category].append(e)
    missed_tags = {t for e in ev[-10:] if not e.is_correct for t in e.tags}

    targets: dict[str, tuple[str, str | None]] = {}
    scored: list[_Scored] = []
    for c in pool:
        if c.category not in targets:
            targets[c.category] = target_difficulty(by_cat.get(c.category, []), ev, label(c.category))
        target, why = targets[c.category]
        dist = abs(F.DIFFICULTIES.index(c.difficulty) - F.DIFFICULTIES.index(target))
        if dist > 1:
            continue  # a HARD question for someone targeting EASY (or vice versa) is not a useful suggestion
        if c.category in weak:
            prio, kind = 0.5 + 0.5 * weak[c.category].severity, "weak"
        elif c.category not in stats:
            prio, kind = 0.45, "explore"
        else:
            prio, kind = 0.15 + 0.2 * (1 - stats[c.category].smoothed_accuracy), "maintain"
        retry = c.id in attempted
        tag_hit = sorted(set(c.tags) & missed_tags)
        score = prio + (1.0 if dist == 0 else 0.5) * 0.5 + (0.15 if retry else 0.0) + (0.1 if tag_hit else 0.0)
        scored.append(_Scored(round(score, 4), c, kind, target, why, retry, tag_hit))

    scored.sort(key=lambda s: (-s.score, s.cand.id))
    per: Counter = Counter()
    out: list[Recommendation] = []
    for s in scored:
        if per[s.cand.category] >= per_category:
            continue
        per[s.cand.category] += 1
        out.append(Recommendation(s.cand.id, s.cand.category, s.cand.difficulty, len(out) + 1, s.score,
                                  _reason(s, weak, stats)))
        if len(out) == limit:
            break
    return out


def next_steps(weak: list[WeakTopic], untouched: list[str], answered: int) -> list[str]:
    if answered == 0:
        return ["Solve a few questions to unlock your readiness estimate."]
    steps = [f"Focus on {label(w.category)}: {w.reasons[0]}" for w in weak[:2]]
    if untouched:
        steps.append("Try a first question in: " + ", ".join(label(c) for c in untouched[:3]) + ".")
    if not steps:
        steps.append("Solid so far. Try harder questions to stretch your range.")
    return steps[:4]
