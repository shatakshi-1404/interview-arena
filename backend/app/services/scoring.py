def score_mcq(selected: set[int], correct: set[int]) -> tuple[bool, float]:
    """Returns (is_correct, score in 0..1).

    is_correct requires an exact match. For multi-answer questions a wrong pick
    cancels a right one, so guessing every option cannot earn partial credit.
    """
    if not correct:
        raise ValueError("Question has no correct option")
    is_correct = selected == correct
    if is_correct:
        return True, 1.0
    hits = len(selected & correct)
    wrong = len(selected - correct)
    return False, max(0.0, (hits - wrong) / len(correct))
