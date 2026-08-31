import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from features.team_strength import extract_team_strength_features
from features.odds_features import extract_odds_features


def test_team_strength_defaults():
    match = {
        'home_rank': 5, 'away_rank': 12,
        'details': {}
    }
    f = extract_team_strength_features(match)
    assert f['rank_diff'] == 7
    assert f['home_goals_avg'] == 1.3  # default


def test_odds_features():
    match = {
        'odds': {
            'sp_home': 1.80, 'sp_draw': 3.50, 'sp_away': 4.50,
            'sp_handicap_home': 2.50, 'sp_handicap_draw': 3.20, 'sp_handicap_away': 2.60,
        }
    }
    f = extract_odds_features(match)
    assert f['sp_home'] == 1.80
    assert 0 < f['implied_home'] < 1
    assert f['odds_margin'] > 0  # 竞彩有抽水
    assert f['cold_index'] > 1.0
