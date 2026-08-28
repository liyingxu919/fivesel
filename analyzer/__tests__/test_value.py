import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from value.evaluator import evaluate_value, find_value_bets, implied_prob, value_level
from value.kelly import kelly_fraction, calculate_stake


def test_implied_prob():
    assert abs(implied_prob(2.0) - 0.5) < 0.001
    assert abs(implied_prob(4.0) - 0.25) < 0.001
    assert implied_prob(1.0) == 0.0
    assert implied_prob(0) == 0.0


def test_evaluate_value():
    # 模型 35%，赔率 5.0（隐含 20%），价值 = 1.75
    assert abs(evaluate_value(0.35, 5.0) - 1.75) < 0.01
    # 模型 50%，赔率 2.0（隐含 50%），价值 = 1.0
    assert abs(evaluate_value(0.50, 2.0) - 1.0) < 0.01
    # 模型 10%，赔率 3.0（隐含 33%），价值 = 0.3
    assert abs(evaluate_value(0.10, 3.0) - 0.3) < 0.01


def test_value_levels():
    assert value_level(2.5) == '极高'
    assert value_level(1.6) == '高'
    assert value_level(1.1) == '正期望'
    assert value_level(0.8) == '无价值'


def test_find_value_bets():
    preds = {'home': 0.45, 'draw': 0.30, 'away': 0.25}
    odds = {'home': 2.10, 'draw': 3.50, 'away': 4.80}

    bets = find_value_bets(preds, odds, min_value=1.0)
    assert len(bets) > 0
    assert all(b['value_score'] >= 1.0 for b in bets)
    assert bets == sorted(bets, key=lambda x: x['value_score'], reverse=True)


def test_kelly_basic():
    # SP=5.0, prob=35% → f* = (4*0.35 - 0.65)/4 = 0.1875, half = 0.09375
    frac = kelly_fraction(0.35, 5.0)
    assert abs(frac - 0.09375) < 0.001


def test_kelly_negative():
    # SP=2.0, prob=30% → negative edge
    frac = kelly_fraction(0.30, 2.0)
    assert frac == 0.0


def test_calculate_stake():
    assert calculate_stake(0.1, 20) == 2.0  # min stake
    assert calculate_stake(0.5, 20) == 10.0  # 50% of budget
