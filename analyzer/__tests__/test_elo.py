import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.elo import EloSystem


def test_initial_rating():
    elo = EloSystem()
    assert elo.get_or_create('Team A') == 1500


def test_stronger_team_higher_win_prob():
    elo = EloSystem()
    elo.ratings['Strong'] = 1800
    elo.ratings['Weak'] = 1200

    pred = elo.predict_match('Strong', 'Weak')
    assert pred['home'] > pred['away']


def test_elo_update():
    elo = EloSystem()
    elo.get_or_create('Home')
    elo.get_or_create('Away')

    elo.update('Home', 'Away', 'home')
    assert elo.ratings['Home'] > 1500
    assert elo.ratings['Away'] < 1500


def test_draw_updates():
    elo = EloSystem()
    elo.ratings['A'] = 1600
    elo.ratings['B'] = 1400

    elo.update('A', 'B', 'draw')
    # A was stronger, so draw should lower A and raise B
    assert elo.ratings['A'] < 1600
    assert elo.ratings['B'] > 1400


def test_home_advantage():
    elo = EloSystem()
    # Same rating, home team should have edge
    pred = elo.predict_match('Home', 'Away')
    assert pred['home'] > pred['away']
