"""基础实力特征提取"""
from features.base import parse_json_field
from value.evaluator import implied_prob


def estimate_goals_from_odds(sp_home, sp_draw, sp_away):
    """
    从竞彩赔率反推期望进球数

    原理：赔率隐含概率 ≈ 市场对结果的预期
    利用隐含概率估算双方实力差距，进而推算期望进球
    """
    if not all([sp_home, sp_draw, sp_away]) or sp_home <= 1 or sp_away <= 1:
        return 1.3, 1.1  # 联赛平均

    imp_home = implied_prob(sp_home)
    imp_draw = implied_prob(sp_draw)
    imp_away = implied_prob(sp_away)

    # 归一化隐含概率
    total_imp = imp_home + imp_draw + imp_away
    if total_imp <= 0:
        return 1.3, 1.1

    norm_home = imp_home / total_imp
    norm_away = imp_away / total_imp

    # 联赛平均总进球约2.5
    league_avg_goals = 2.5

    # 主队进球 = 总进球 × 主队胜率权重 × 主场加成
    # 客队进球 = 总进球 × 客队胜率权重
    # 平局时双方进球接近
    home_ratio = norm_home + 0.15 * norm_draw_fallback(norm_home, norm_away)
    away_ratio = norm_away + 0.15 * norm_draw_fallback(norm_home, norm_away)

    # 归一化使总进球约2.5
    total_ratio = home_ratio + away_ratio
    home_lambda = league_avg_goals * (home_ratio / total_ratio) * 1.15  # 主场加成
    away_lambda = league_avg_goals * (away_ratio / total_ratio)

    return round(home_lambda, 2), round(away_lambda, 2)


def norm_draw_fallback(norm_home, norm_away):
    """估算平局概率权重"""
    return max(0, 1 - norm_home - norm_away)


def extract_team_strength_features(match_dict):
    """
    提取基础实力特征

    优先使用赔率数据驱动预测，而非固定默认值
    """
    features = {}

    # 排名
    features['home_rank'] = match_dict.get('home_rank') or 99
    features['away_rank'] = match_dict.get('away_rank') or 99
    features['rank_diff'] = features['away_rank'] - features['home_rank']

    # 从赔率反推期望进球 — 这是核心数据源
    odds = match_dict.get('odds', {})
    sp_home = odds.get('sp_home')
    sp_draw = odds.get('sp_draw')
    sp_away = odds.get('sp_away')

    home_lambda, away_lambda = estimate_goals_from_odds(sp_home, sp_draw, sp_away)
    features['home_goals_avg'] = home_lambda
    features['home_conceded_avg'] = away_lambda  # 主队失球 ≈ 客队进球
    features['away_goals_avg'] = away_lambda
    features['away_conceded_avg'] = home_lambda  # 客队失球 ≈ 主队进球

    # 从 details 提取战绩（如果有的话，用于微调）
    details = match_dict.get('details', {})
    home_form = parse_json_field(details.get('home_form_json'))
    away_form = parse_json_field(details.get('away_form_json'))

    if home_form and isinstance(home_form, dict) and home_form.get('recent_form'):
        # 来自 team_profiles.json 的格式
        form = home_form['recent_form'][-5:]  # 近5场
        features['home_form_wins'] = sum(1 for r in form if r == 'W')
        features['home_form_draws'] = sum(1 for r in form if r == 'D')
        features['home_form_losses'] = sum(1 for r in form if r == 'L')
        # 根据状态微调进球预期
        form_factor = (features['home_form_wins'] * 0.06 - features['home_form_losses'] * 0.04)
        features['home_goals_avg'] = max(0.5, home_lambda + form_factor)
    elif home_form and isinstance(home_form, list):
        # FlashScore 格式
        recent = home_form[:10]
        features['home_form_wins'] = sum(1 for m in recent if m.get('result') == 'W')
        features['home_form_draws'] = sum(1 for m in recent if m.get('result') == 'D')
        features['home_form_losses'] = sum(1 for m in recent if m.get('result') == 'L')
        goals = [m.get('goals_for', 0) for m in recent]
        conceded = [m.get('goals_against', 0) for m in recent]
        if goals:
            features['home_goals_avg'] = (sum(goals) / len(goals) + home_lambda) / 2
            features['home_conceded_avg'] = (sum(conceded) / len(conceded) + away_lambda) / 2
    else:
        features['home_form_wins'] = 0
        features['home_form_draws'] = 0
        features['home_form_losses'] = 0

    if away_form and isinstance(away_form, dict) and away_form.get('recent_form'):
        form = away_form['recent_form'][-5:]
        features['away_form_wins'] = sum(1 for r in form if r == 'W')
        features['away_form_draws'] = sum(1 for r in form if r == 'D')
        features['away_form_losses'] = sum(1 for r in form if r == 'L')
        form_factor = (features['away_form_wins'] * 0.06 - features['away_form_losses'] * 0.04)
        features['away_goals_avg'] = max(0.5, away_lambda + form_factor)
    elif away_form and isinstance(away_form, list):
        recent = away_form[:10]
        features['away_form_wins'] = sum(1 for m in recent if m.get('result') == 'W')
        features['away_form_draws'] = sum(1 for m in recent if m.get('result') == 'D')
        features['away_form_losses'] = sum(1 for m in recent if m.get('result') == 'L')
        goals = [m.get('goals_for', 0) for m in recent]
        conceded = [m.get('goals_against', 0) for m in recent]
        if goals:
            features['away_goals_avg'] = (sum(goals) / len(goals) + away_lambda) / 2
            features['away_conceded_avg'] = (sum(conceded) / len(conceded) + home_lambda) / 2
    else:
        features['away_form_wins'] = 0
        features['away_form_draws'] = 0
        features['away_form_losses'] = 0

    return features
