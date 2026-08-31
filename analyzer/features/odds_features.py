"""赔率特征提取"""
from value.evaluator import implied_prob, evaluate_value


def extract_odds_features(match_dict):
    """
    提取赔率相关特征

    返回 dict:
        sp_home, sp_draw, sp_away,
        implied_home, implied_draw, implied_away,
        sp_handicap_home, sp_handicap_draw, sp_handicap_away,
        odds_margin,  # 抽水率
        cold_index,   # 冷门指数
    """
    features = {}
    odds = match_dict.get('odds', {})

    # 胜平负 SP
    features['sp_home'] = odds.get('sp_home') or 0
    features['sp_draw'] = odds.get('sp_draw') or 0
    features['sp_away'] = odds.get('sp_away') or 0

    # 隐含概率
    features['implied_home'] = implied_prob(features['sp_home'])
    features['implied_draw'] = implied_prob(features['sp_draw'])
    features['implied_away'] = implied_prob(features['sp_away'])

    # 让球胜平负
    features['sp_handicap_home'] = odds.get('sp_handicap_home') or 0
    features['sp_handicap_draw'] = odds.get('sp_handicap_draw') or 0
    features['sp_handicap_away'] = odds.get('sp_handicap_away') or 0

    # 抽水率（隐含概率总和 - 1）
    total_implied = features['implied_home'] + features['implied_draw'] + features['implied_away']
    features['odds_margin'] = total_implied - 1.0 if total_implied > 0 else 0

    # 冷门指数：最高赔率 / 最低赔率
    sps = [s for s in [features['sp_home'], features['sp_draw'], features['sp_away']] if s > 0]
    if sps:
        features['cold_index'] = max(sps) / min(sps)
    else:
        features['cold_index'] = 1.0

    return features
