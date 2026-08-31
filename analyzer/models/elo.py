"""Elo 评分系统"""
import json
import os
import math
from config import ELO_INITIAL, ELO_K, ELO_HOME_ADVANTAGE

ELO_RATINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'elo_ratings.json')


class EloSystem:
    """足球 Elo 评分系统"""

    def __init__(self, initial=ELO_INITIAL, k=ELO_K, home_advantage=ELO_HOME_ADVANTAGE):
        self.ratings = {}
        self.initial = initial
        self.k = k
        self.home_advantage = home_advantage
        self._load()

    def _load(self):
        """从 JSON 文件加载 Elo 评分"""
        if os.path.exists(ELO_RATINGS_PATH):
            try:
                with open(ELO_RATINGS_PATH, 'r', encoding='utf-8') as f:
                    self.ratings = json.load(f)
            except (json.JSONDecodeError, IOError):
                pass

    def save(self):
        """将 Elo 评分保存到 JSON 文件"""
        os.makedirs(os.path.dirname(ELO_RATINGS_PATH), exist_ok=True)
        with open(ELO_RATINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(self.ratings, f, ensure_ascii=False, indent=2)

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

    def init_from_db(self, db):
        """
        从数据库的赔率和排名初始化 Elo 评分

        原理：赔率越低 → 市场认为越强 → Elo 越高
        """
        cursor = db.execute('''
            SELECT m.match_id, m.home_team, m.away_team, m.home_rank, m.away_rank,
                   o.sp_home, o.sp_away
            FROM matches m
            LEFT JOIN odds_snapshots o ON m.match_id = o.match_id
        ''')

        team_scores = {}  # team -> list of implied strengths

        for row in cursor.fetchall():
            match_id, home, away, h_rank, a_rank, sp_home, sp_away = row

            # 从赔率推算实力
            if sp_home and sp_away and sp_home > 1 and sp_away > 1:
                imp_home = 1.0 / sp_home
                imp_away = 1.0 / sp_away
                total = imp_home + imp_away
                # 归一化为0-1实力值
                home_strength = imp_home / total
                away_strength = imp_away / total

                team_scores.setdefault(home, []).append(home_strength)
                team_scores.setdefault(away, []).append(away_strength)

            # 从排名推算（排名越低越强）
            if h_rank and h_rank < 99:
                team_scores.setdefault(home, []).append(max(0.1, 1 - h_rank / 30))
            if a_rank and a_rank < 99:
                team_scores.setdefault(away, []).append(max(0.1, 1 - a_rank / 30))

        # 转换为 Elo 评分
        for team, scores in team_scores.items():
            avg_strength = sum(scores) / len(scores)
            # 映射到 Elo: 0.5→1500, 0.7→1700, 0.3→1300
            elo = 1000 + avg_strength * 1000
            if team not in self.ratings or self.ratings[team] == self.initial:
                self.ratings[team] = round(elo)
