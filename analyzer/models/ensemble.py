"""集成预测模型"""
import json
import sqlite3
from models.poisson import PoissonModel
from models.elo import EloSystem
from value.evaluator import find_value_bets
from features.team_strength import extract_team_strength_features
from features.odds_features import extract_odds_features
from config import DB_PATH


class EnsembleModel:
    """集成泊松 + Elo 的预测模型"""

    def __init__(self, poisson_weight=0.6, elo_weight=0.4):
        self.poisson = PoissonModel()
        self.elo = EloSystem()
        self.poisson_weight = poisson_weight
        self.elo_weight = elo_weight

    def predict(self, features):
        """
        综合预测

        参数:
            features: dict, 包含 team_strength + odds_features

        返回:
            dict: {
                'spf_probs': {'home': float, 'draw': float, 'away': float},
                'total_goals_probs': {...},
                'score_probs': {...},
                'poisson_raw': {...},
            }
        """
        # 泊松模型
        poisson_result = self.poisson.predict(
            home_attack=features.get('home_goals_avg', 1.3),
            away_attack=features.get('away_goals_avg', 1.1),
            home_defense=features.get('home_conceded_avg', 1.3),
            away_defense=features.get('away_conceded_avg', 1.4),
        )

        # Elo 模型
        home_team = features.get('home_team', 'Home')
        away_team = features.get('away_team', 'Away')
        elo_probs = self.elo.predict_match(home_team, away_team)

        # 集成
        spf_probs = {
            'home': self.poisson_weight * poisson_result['spf_probs']['home'] +
                    self.elo_weight * elo_probs['home'],
            'draw': self.poisson_weight * poisson_result['spf_probs']['draw'] +
                    self.elo_weight * elo_probs['draw'],
            'away': self.poisson_weight * poisson_result['spf_probs']['away'] +
                    self.elo_weight * elo_probs['away'],
        }

        # 归一化
        total = sum(spf_probs.values())
        spf_probs = {k: v / total for k, v in spf_probs.items()}

        return {
            'spf_probs': spf_probs,
            'total_goals_probs': poisson_result['total_goals_probs'],
            'score_probs': poisson_result['score_probs'],
            'poisson_raw': poisson_result,
        }
