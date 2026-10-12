from collections import Counter

import numpy as np

from app.ml import features as F
from app.ml import readiness as R
from tests.test_ml_features import ev


def feats(**over):
    base = dict(answered=40, solved=25, accuracy=0.6, recent_accuracy=0.6, avg_time_ratio=0.8,
                difficulty_weighted=0.5, topic_coverage=0.5)
    base.update(over)
    return F.ReadinessFeatures(**base)


STRONG = feats(answered=120, solved=80, accuracy=0.9, recent_accuracy=0.9, avg_time_ratio=0.4,
               difficulty_weighted=0.85, topic_coverage=1.0)
WEAK = feats(answered=15, solved=5, accuracy=0.3, recent_accuracy=0.25, avg_time_ratio=1.4,
             difficulty_weighted=0.2, topic_coverage=0.125)
MIDDLE = feats()


def test_rubric_labels():
    assert R.rubric_label(STRONG) == R.READY
    assert R.rubric_label(MIDDLE) == R.DEVELOPING
    assert R.rubric_label(WEAK) == R.NEEDS


def test_good_scores_without_breadth_are_not_interview_ready():
    narrow = feats(answered=12, solved=10, accuracy=0.95, recent_accuracy=0.95, avg_time_ratio=0.3,
                   difficulty_weighted=0.9, topic_coverage=0.25)
    assert R.rubric_score(narrow) >= 70
    assert R.rubric_label(narrow) == R.DEVELOPING


def test_synthetic_data_is_deterministic_and_covers_all_classes():
    X1, y1 = R.synthetic_profiles(seed=3)
    X2, y2 = R.synthetic_profiles(seed=3)
    assert np.array_equal(X1, X2) and y1 == y2
    counts = Counter(y1)
    assert set(counts) == set(R.LABELS)
    assert all(c / len(y1) > 0.05 for c in counts.values())


def test_model_is_deterministic():
    a, b = R.train_model(7), R.train_model(7)
    assert a.predict(MIDDLE).probabilities == b.predict(MIDDLE).probabilities


def test_model_classifies_prototypes():
    assert R.predict(STRONG).category == R.READY
    assert R.predict(MIDDLE).category == R.DEVELOPING
    assert R.predict(WEAK).category == R.NEEDS


def test_prediction_is_explainable():
    p = R.predict(MIDDLE)
    assert abs(sum(p.probabilities.values()) - 1) < 1e-3
    assert len(p.drivers) == 3 and all(d["effect"] in ("raises", "lowers") for d in p.drivers)
    assert 0 <= p.score <= 100


def test_agreement_with_rubric_on_fresh_synthetic_data():
    """Sanity check only: the model approximates its own training rubric. NOT a real-world accuracy figure."""
    X, y = R.synthetic_profiles(n=1500, seed=999)
    pred = R.train_model(7).pipeline.predict(X)
    assert (pred == np.array(y)).mean() > 0.8


def test_topic_readiness():
    events = [ev(i, True, cat="DSA", diff="MEDIUM") for i in range(4)]
    by = {t.category: t for t in R.topic_readiness(events)}
    assert by["DSA"].score == 86.4 and by["DSA"].confidence == "LOW" and by["DSA"].attempts == 4  # (8+1.5)/(8+3)
    assert by["SQL"].score is None and by["SQL"].confidence == "NONE"
