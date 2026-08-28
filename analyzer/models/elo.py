"""Elo 评分系统"""
import math
from config import ELO_INITIAL, ELO_K, ELO_HOME_ADVANTAGE


class EloSystem:
    """足球 Elo 评分系统"""

    def __init__(self, initial=ELO_INITIAL, k=ELO_K, home_advantage=ELO_HOME_ADVANTAGE):
        self.ratings = {}
        self.initial = initial
        self.k = k
        self.home_advantage = home_advantage

    def get_or_create(self, team_name):
        if team_name not in self.ratings:
            self.ratings[team_name] = self.initial
        return self.ratings[team_name]

    def expected_score(self, rating_a, rating_b):
        return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))

    def predict_match(self, home_team, away_team):
        """
        预测比赛结果概率

        返回: {'home': float, 'draw': float, 'away': float}
        """
        home_elo = self.get_or_create(home_team) + self.home_advantage
        away_elo = self.get_or_create(away_team)

        expected_home = self.expected_score(home_elo, away_elo)

        # Elo 期望值是胜率，需要推导平局概率
        # 使用经验公式：draw_prob ≈ 0.25 + 0.1 × (1 - |expected_home - 0.5| × 2)
        draw_factor = 1.0 - abs(expected_home - 0.5) * 2
        draw_prob = 0.22 + 0.12 * draw_factor

        home_win_prob = expected_home * (1 - draw_prob)
        away_win_prob = (1 - expected_home) * (1 - draw_prob)

        # 归一化
        total = home_win_prob + draw_prob + away_win_prob
        return {
            'home': home_win_prob / total,
            'draw': draw_prob / total,
            'away': away_win_prob / total,
        }

    def update(self, home_team, away_team, result):
        """
        更新 Elo 评分

        参数:
            result: 'home' | 'draw' | 'away'
        """
        home_elo = self.get_or_create(home_team)
        away_elo = self.get_or_create(away_team)

        expected_home = self.expected_score(home_elo + self.home_advantage, away_elo)

        if result == 'home':
            actual_home = 1.0
        elif result == 'draw':
            actual_home = 0.5
        else:
            actual_home = 0.0

        self.ratings[home_team] = home_elo + self.k * (actual_home - expected_home)
        self.ratings[away_team] = away_elo + self.k * ((1 - actual_home) - (1 - expected_home))

    def load_ratings(self, ratings_dict):
        self.ratings = dict(ratings_dict)

    def export_ratings(self):
        return dict(self.ratings)
