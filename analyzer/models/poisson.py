"""泊松分布进球模型"""
import math
import numpy as np
from config import POISSON_MAX_GOALS, HOME_ADVANTAGE


def poisson_pmf(k, lam):
    """泊松概率质量函数"""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


class PoissonModel:
    """基于泊松分布的足球进球预测模型"""

    def __init__(self, max_goals=POISSON_MAX_GOALS, home_advantage=HOME_ADVANTAGE):
        self.max_goals = max_goals
        self.home_advantage = home_advantage

    def predict(self, home_attack, away_attack, home_defense, away_defense):
        """
        预测比赛结果概率分布

        参数:
            home_attack: 主队攻击力（场均进球）
            away_attack: 客队攻击力（场均进球）
            home_defense: 主队防守力（场均失球）
            away_defense: 客队防守力（场均失球）

        返回:
            dict: {
                'score_matrix': np.array,  # 比分概率矩阵 [home_goals][away_goals]
                'home_goals_lambda': float,
                'away_goals_lambda': float,
                'spf_probs': {'home': float, 'draw': float, 'away': float},
                'total_goals_probs': {0: float, 1: float, ..., '7+': float},
                'score_probs': {'0:0': float, '1:0': float, ...},
            }
        """
        # 计算期望进球数（lambda）
        # 主队进球 = 主队攻击力 × 客队防守弱点 × 主场加成
        home_lambda = home_attack * (away_defense / 1.0) * (1 + self.home_advantage)
        # 客队进球 = 客队攻击力 × 主队防守弱点
        away_lambda = away_attack * (home_defense / 1.0)

        # 确保 lambda 合理
        home_lambda = max(0.2, min(home_lambda, 5.0))
        away_lambda = max(0.2, min(away_lambda, 5.0))

        # 计算比分概率矩阵
        n = self.max_goals + 1
        score_matrix = np.zeros((n, n))

        for i in range(n):
            for j in range(n):
                p_home = poisson_pmf(i, home_lambda)
                p_away = poisson_pmf(j, away_lambda)
                score_matrix[i][j] = p_home * p_away

        # 归一化（处理 7+ 的截断误差）
        total = score_matrix.sum()
        if total > 0:
            score_matrix /= total

        # 胜平负概率
        home_win = 0.0
        draw = 0.0
        away_win = 0.0
        for i in range(n):
            for j in range(n):
                if i > j:
                    home_win += score_matrix[i][j]
                elif i == j:
                    draw += score_matrix[i][j]
                else:
                    away_win += score_matrix[i][j]

        # 总进球数概率
        total_goals_probs = {}
        for goals in range(self.max_goals):
            prob = 0.0
            for i in range(n):
                for j in range(n):
                    if i + j == goals:
                        prob += score_matrix[i][j]
            total_goals_probs[goals] = prob
        # 7+
        prob_7plus = 0.0
        for i in range(n):
            for j in range(n):
                if i + j >= self.max_goals:
                    prob_7plus += score_matrix[i][j]
        total_goals_probs['7+'] = prob_7plus

        # 比分概率
        score_probs = {}
        for i in range(min(5, n)):
            for j in range(min(5, n)):
                key = f'{i}:{j}'
                score_probs[key] = float(score_matrix[i][j])

        return {
            'score_matrix': score_matrix,
            'home_goals_lambda': home_lambda,
            'away_goals_lambda': away_lambda,
            'spf_probs': {
                'home': float(home_win),
                'draw': float(draw),
                'away': float(away_win),
            },
            'total_goals_probs': total_goals_probs,
            'score_probs': score_probs,
        }
