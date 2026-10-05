"""Deterministic short-answer evaluation: concept coverage + TF-IDF similarity + completeness + clarity.

A practice-grade grader, not a proctored one. It rewards answers that name the right concepts in
their own words, but a determined user can still game any keyword-based system.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

W_COVERAGE, W_SIMILARITY, W_COMPLETENESS, W_CLARITY = 0.55, 0.20, 0.15, 0.10
PASS_SCORE = 0.6
MIN_COVERAGE = 0.5
SIMILARITY_FULL = 0.5  # cosine similarity at which the similarity dimension reaches 1.0 (tunable)
STUFFING_PENALTY = 0.5

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def stem(w: str) -> str:
    """Tiny suffix stripper. It only has to be *consistent* on both sides of a comparison."""
    if len(w) <= 3:
        return w
    if w.endswith("ies") and len(w) > 4:
        w = w[:-3] + "y"
    elif w.endswith(("sses", "xes", "ches", "shes")):
        w = w[:-2]
    elif w.endswith("s") and not w.endswith(("ss", "us", "is")):
        w = w[:-1]
    for suf in ("ation", "ment", "ing", "ed", "ly"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            w = w[: -len(suf)]
            break
    if w.endswith("e") and len(w) > 4:
        w = w[:-1]
    return w


def _stems(text: str) -> list[str]:
    return [stem(t) for t in tokenize(text)]


def _phrase_in(stems: list[str], phrase: list[str]) -> bool:
    """Contiguous match, or all phrase words within a window two words wider than the phrase."""
    m = len(phrase)
    if m == 0:
        return False
    if m == 1:
        return phrase[0] in stems
    for i in range(len(stems) - m + 1):
        if stems[i : i + m] == phrase:
            return True
    need, width = set(phrase), m + 2
    return any(need <= set(stems[i : i + width]) for i in range(max(1, len(stems) - width + 1)))


def _content(text: str) -> list[str]:
    return [stem(t) for t in tokenize(text) if t not in ENGLISH_STOP_WORDS]


def similarity(answer: str, reference: str) -> float:
    a, r = " ".join(_content(answer)), " ".join(_content(reference))
    if not a or not r:
        return 0.0
    m = TfidfVectorizer(token_pattern=r"\S+", ngram_range=(1, 2), sublinear_tf=True).fit_transform([r, a])
    return float(cosine_similarity(m[0], m[1])[0, 0])


@dataclass
class Evaluation:
    score: float
    passed: bool
    dimensions: dict[str, float]
    matched_concepts: list[str]
    missing_concepts: list[str]
    feedback: list[str]

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "passed": self.passed,
            "dimensions": self.dimensions,
            "matched_concepts": self.matched_concepts,
            "missing_concepts": self.missing_concepts,
            "feedback": self.feedback,
        }


def _clarity(text: str, tokens: list[str]) -> float:
    if len(tokens) < 3:
        return 0.0
    sentences = [s for s in re.split(r"[.!?\n]+", text) if s.strip()]
    avg_len = len(tokens) / max(1, len(sentences))
    length_score = 1.0 if 5 <= avg_len <= 35 else 0.5
    diversity = len(set(tokens)) / len(tokens)
    return 0.5 * length_score + 0.5 * min(1.0, diversity / 0.5)


def evaluate_answer(answer: str, model_answer: str, concepts: list[dict]) -> Evaluation:
    """concepts: [{"concept": str, "keywords": [str], "weight": int}]"""
    tokens = tokenize(answer)
    names = [c["concept"] for c in concepts]
    if not tokens:
        return Evaluation(0.0, False, {"coverage": 0.0, "similarity": 0.0, "completeness": 0.0, "clarity": 0.0},
                          [], names, ["Write an answer first."])
    stems = [stem(t) for t in tokens]

    matched, missing = [], []
    total_w = covered_w = 0.0
    keyword_vocab: set[str] = set()
    for c in concepts:
        w = float(c.get("weight", 1))
        keywords = list(c.get("keywords", [])) + [c["concept"]]
        phrases = [[stem(t) for t in tokenize(k)] for k in keywords]
        for p in phrases:
            keyword_vocab.update(p)
        total_w += w
        if any(_phrase_in(stems, p) for p in phrases if p):
            matched.append(c["concept"])
            covered_w += w
        else:
            missing.append(c["concept"])
    coverage = covered_w / total_w if total_w else 0.0

    sim = min(1.0, similarity(answer, model_answer) / SIMILARITY_FULL)
    target_words = min(120.0, max(8.0, 0.6 * len(tokenize(model_answer))))
    completeness = min(1.0, len(tokens) / target_words)
    clarity = _clarity(answer, tokens)

    # Keyword-dump guard: nearly every content word is a keyword and the answer is not a sentence-level explanation.
    content = _content(answer)
    stuffing = len(content) >= 5 and sum(1 for t in content if t in keyword_vocab) / len(content) >= 0.85
    if stuffing:
        clarity = min(clarity, 0.3)

    score = W_COVERAGE * coverage + W_SIMILARITY * sim + W_COMPLETENESS * completeness + W_CLARITY * clarity
    if stuffing:
        score *= STUFFING_PENALTY
    score = round(score, 4)

    feedback: list[str] = []
    if matched:
        feedback.append("Covered: " + ", ".join(matched) + ".")
    if missing:
        feedback.append("Consider mentioning: " + ", ".join(missing) + ".")
    if completeness < 0.6:
        feedback.append("Your answer is brief; add more detail or an example.")
    if stuffing:
        feedback.append("Your answer reads like a list of keywords. Explain the ideas in full sentences.")

    return Evaluation(
        score=score,
        passed=score >= PASS_SCORE and coverage >= MIN_COVERAGE,
        dimensions={"coverage": round(coverage, 3), "similarity": round(sim, 3),
                    "completeness": round(completeness, 3), "clarity": round(clarity, 3)},
        matched_concepts=matched,
        missing_concepts=missing,
        feedback=feedback,
    )
