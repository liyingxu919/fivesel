import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.poisson import PoissonModel, poisson_pmf


def test_poisson_pmf():
    assert abs(poisson_pmf(0, 1.0) - 0.3679) < 0.001
    assert abs(poisson_pmf(1, 1.0) - 0.3679) < 0.001
    assert abs(poisson_pmf(2, 1.0) - 0.1839) < 0.001
    assert poisson_pmf(0, 0) == 1.0


def test_model_output_structure():
    model = PoissonModel()
    result = model.predict(1.5, 1.2, 1.0, 1.0)

    assert 'spf_probs' in result
    assert 'total_goals_probs' in result
    assert 'score_probs' in result
    assert 'score_matrix' in result

    spf = result['spf_probs']
    assert abs(spf['home'] + spf['draw'] + spf['away'] - 1.0) < 0.01


def test_strong_home_team():
    model = PoissonModel()
    result = model.predict(2.5, 0.8, 0.8, 1.5)

    spf = result['spf_probs']
    assert spf['home'] > spf['away'], "强主队应有更高胜率"
    assert spf['home'] > 0.4


def test_balanced_match():
    model = PoissonModel()
    result = model.predict(1.3, 1.3, 1.0, 1.0)

    spf = result['spf_probs']
    assert abs(spf['home'] - spf['away']) < 0.15, "实力相近比赛主客胜率应接近"
