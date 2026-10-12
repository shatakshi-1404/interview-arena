"""Practice-readiness: a transparent rubric plus a logistic-regression classifier.

IMPORTANT, and surfaced in the API: the classifier is trained on *synthetic practice profiles labelled by
the rubric below*. It makes the rubric's boundaries smooth and explainable (probabilities, per-feature
drivers). It has NOT been validated against real interview or hiring outcomes and must not be presented
as predicting them.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

from app.ml import features as F

MODEL_VERSION = "1"
MIN_QUESTIONS = 10  # below this, no category is produced
LABELS = ("Needs Practice", "Developing", "Interview Ready")
READY, DEVELOPING, NEEDS = LABELS[2], LABELS[1], LABELS[0]

FEATURE_LABELS = {
    "accuracy": "Overall accuracy",
    "recent_accuracy": "Recent accuracy",
    "avg_time_ratio": "Time used vs suggested",
    "solved_score": "Questions solved",
    "difficulty_weighted": "Performance on harder questions",
    "topic_coverage": "Topic coverage",
}


# ------------------------------------------------------------------- rubric
def rubric_score(f: F.ReadinessFeatures) -> float:
    """0..100. Weights: difficulty-weighted performance 25, recent accuracy 20, accuracy 20,
    coverage 15, volume 10, speed 10."""
    volume = min(1.0, f.solved / 50)
    speed = 1.0 - min(1.0, max(0.0, f.avg_time_ratio - 0.2))  # <=20% of suggested time = full marks
    total = (
        0.25 * f.difficulty_weighted
        + 0.20 * f.recent_accuracy
        + 0.20 * f.accuracy
        + 0.15 * f.topic_coverage
        + 0.10 * volume
        + 0.10 * speed
    )
    return round(100 * total, 1)


def rubric_label(f: F.ReadinessFeatures) -> str:
    s = rubric_score(f)
    if s >= 70 and f.topic_coverage >= 0.5 and f.solved >= 20:  # gates: breadth and volume, not just a good streak
        return READY
    if s >= 45:
        return DEVELOPING
    return NEEDS


# --------------------------------------------------------- synthetic training
def synthetic_profiles(n: int = 4000, seed: int = 7) -> tuple[np.ndarray, list[str]]:
    rng = np.random.default_rng(seed)
    rows: list[list[float]] = []
    labels: list[str] = []
    for _ in range(n):
        skill = rng.beta(2.2, 2.2)
        answered = MIN_QUESTIONS + int(rng.gamma(1.6, 30))
        acc = float(np.clip(skill + rng.normal(0, 0.07), 0.02, 0.99))
        recent = float(np.clip(acc + rng.normal(0, 0.10), 0.0, 1.0))
        solved = max(1, min(answered, int(answered * np.clip(acc * rng.uniform(0.6, 1.0), 0.05, 1.0))))
        dw = float(np.clip(acc * rng.uniform(0.7, 1.05) + rng.normal(0, 0.04), 0.0, 1.0))
        ratio = float(np.clip(1.1 - 0.7 * skill + rng.normal(0, 0.2), 0.05, 2.0))
        cats = int(np.clip(rng.normal(answered / 15, 1.5), 0, 8))
        f = F.ReadinessFeatures(answered, solved, acc, recent, ratio, dw, cats / len(F.CATEGORIES))
        rows.append(f.vector())
        labels.append(rubric_label(f))
    return np.array(rows), labels


@dataclass
class ReadinessPrediction:
    score: float  # rubric score, 0..100
    category: str  # model prediction
    probabilities: dict[str, float]
    rubric_category: str
    drivers: list[dict]  # features pushing the "Interview Ready" probability up or down


class ReadinessModel:
    def __init__(self, pipeline: Pipeline):
        self.pipeline = pipeline
        self.classes = [str(c) for c in pipeline.classes_]

    def predict(self, f: F.ReadinessFeatures) -> ReadinessPrediction:
        x = np.array([f.vector()])
        proba = self.pipeline.predict_proba(x)[0]
        scaler, clf = self.pipeline[0], self.pipeline[1]
        z = scaler.transform(x)[0]
        contrib = clf.coef_[self.classes.index(READY)] * z
        order = np.argsort(-np.abs(contrib))[:3]
        drivers = [
            {
                "feature": F.FEATURE_NAMES[i],
                "label": FEATURE_LABELS[F.FEATURE_NAMES[i]],
                "effect": "raises" if contrib[i] > 0 else "lowers",
            }
            for i in order
        ]
        return ReadinessPrediction(
            score=rubric_score(f),
            category=self.classes[int(proba.argmax())],
            probabilities={c: round(float(p), 4) for c, p in zip(self.classes, proba)},
            rubric_category=rubric_label(f),
            drivers=drivers,
        )


@lru_cache(maxsize=4)
def train_model(seed: int = 7) -> ReadinessModel:
    X, y = synthetic_profiles(seed=seed)
    pipe = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))
    pipe.fit(X, y)
    return ReadinessModel(pipe)


def predict(f: F.ReadinessFeatures) -> ReadinessPrediction:
    return train_model().predict(f)


# --------------------------------------------------------- per-topic readiness
@dataclass(frozen=True)
class TopicReadiness:
    category: str
    score: float | None  # 0..100, None when never practiced
    attempts: int
    confidence: str  # NONE | LOW | MEDIUM | HIGH


def topic_readiness(events, categories=F.CATEGORIES) -> list[TopicReadiness]:
    """Difficulty-weighted, small-sample-shrunk score per category."""
    by_cat: dict[str, list[F.Event]] = {c: [] for c in categories}
    for e in events:
        if e.category in by_cat:
            by_cat[e.category].append(e)
    out = []
    for cat in categories:
        evs = by_cat[cat]
        n = len(evs)
        if n == 0:
            out.append(TopicReadiness(cat, None, 0, "NONE"))
            continue
        wsum = sum(F.DIFFICULTY_WEIGHT[e.difficulty] * e.score for e in evs)
        wtot = sum(F.DIFFICULTY_WEIGHT[e.difficulty] for e in evs)
        score = round(100 * F.smoothed_rate(wsum, wtot), 1)
        out.append(TopicReadiness(cat, score, n, "LOW" if n < 5 else "MEDIUM" if n < 15 else "HIGH"))
    return out
