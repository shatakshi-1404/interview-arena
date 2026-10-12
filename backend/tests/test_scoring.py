import pytest

from app.services.scoring import score_mcq


def test_exact_match_is_correct():
    assert score_mcq({2}, {2}) == (True, 1.0)
    assert score_mcq({1, 2}, {1, 2}) == (True, 1.0)


def test_wrong_single_answer():
    assert score_mcq({1}, {2}) == (False, 0.0)


def test_partial_credit_for_multi_answer():
    assert score_mcq({1}, {1, 2}) == (False, 0.5)


def test_wrong_pick_cancels_right_pick():
    assert score_mcq({1, 3}, {1, 2}) == (False, 0.0)


def test_selecting_everything_earns_no_free_credit():
    correct, score = score_mcq({1, 2, 3, 4}, {1, 2})
    assert correct is False
    assert score == 0.0


def test_no_correct_option_is_an_error():
    with pytest.raises(ValueError):
        score_mcq({1}, set())
