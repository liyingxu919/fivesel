"""基础实力特征提取"""
from features.base import parse_json_field


def extract_team_strength_features(match_dict):
    """
    提取基础实力特征

    返回 dict:
        home_rank, away_rank,
        rank_diff,
        home_form_wins, home_form_draws, home_form_losses (近 10 场),
        away_form_wins, away_form_draws, away_form_losses,
        home_goals_avg, home_conceded_avg,
        away_goals_avg, away_conceded_avg,
    """
    features = {}

    # 排名
    features['home_rank'] = match_dict.get('home_rank') or 99
    features['away_rank'] = match_dict.get('away_rank') or 99
    features['rank_diff'] = features['away_rank'] - features['home_rank']

    # 从 details 提取战绩
    details = match_dict.get('details', {})
    home_form = parse_json_field(details.get('home_form_json'))
    away_form = parse_json_field(details.get('away_form_json'))

    if home_form and isinstance(home_form, list):
        recent = home_form[:10]
        features['home_form_wins'] = sum(1 for m in recent if m.get('result') == 'W')
        features['home_form_draws'] = sum(1 for m in recent if m.get('result') == 'D')
        features['home_form_losses'] = sum(1 for m in recent if m.get('result') == 'L')
        goals = [m.get('goals_for', 0) for m in recent]
        conceded = [m.get('goals_against', 0) for m in recent]
        features['home_goals_avg'] = sum(goals) / max(len(goals), 1)
        features['home_conceded_avg'] = sum(conceded) / max(len(conceded), 1)
    else:
        features['home_form_wins'] = 0
        features['home_form_draws'] = 0
        features['home_form_losses'] = 0
        features['home_goals_avg'] = 1.3  # 联赛平均
        features['home_conceded_avg'] = 1.3

    if away_form and isinstance(away_form, list):
        recent = away_form[:10]
        features['away_form_wins'] = sum(1 for m in recent if m.get('result') == 'W')
        features['away_form_draws'] = sum(1 for m in recent if m.get('result') == 'D')
        features['away_form_losses'] = sum(1 for m in recent if m.get('result') == 'L')
        goals = [m.get('goals_for', 0) for m in recent]
        conceded = [m.get('goals_against', 0) for m in recent]
        features['away_goals_avg'] = sum(goals) / max(len(goals), 1)
        features['away_conceded_avg'] = sum(conceded) / max(len(conceded), 1)
    else:
        features['away_form_wins'] = 0
        features['away_form_draws'] = 0
        features['away_form_losses'] = 0
        features['away_goals_avg'] = 1.1  # 客场略低
        features['away_conceded_avg'] = 1.4

    return features
