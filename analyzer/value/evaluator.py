"""价值评估系统"""
from config import VALUE_THRESHOLD, VALUE_HIGH, VALUE_VERY_HIGH, MAX_ODDS_RECOMMEND, MIN_PROB_RECOMMEND


def implied_prob(sp):
    """从竞彩 SP 赔率反推隐含概率"""
    if sp is None or sp <= 1.0:
        return 0.0
    return 1.0 / sp


def evaluate_value(model_prob, odds_sp):
    """
    计算价值得分

    价值得分 = 模型概率 / 赔率隐含概率
    > 1.0 = 正期望
    > 1.5 = 高价值
    > 2.0 = 极高价值
    """
    imp = implied_prob(odds_sp)
    if imp <= 0:
        return 0.0
    return model_prob / imp


def value_level(score):
    """价值等级"""
    if score >= VALUE_VERY_HIGH:
        return '极高'
    elif score >= VALUE_HIGH:
        return '高'
    elif score >= VALUE_THRESHOLD:
        return '正期望'
    else:
        return '无价值'


def find_value_bets(predictions, odds, min_value=VALUE_THRESHOLD):
    """
    从预测结果和赔率中找出价值投注

    参数:
        predictions: dict, 如 {'home': 0.45, 'draw': 0.30, 'away': 0.25}
        odds: dict, 如 {'home': 2.10, 'draw': 3.50, 'away': 4.80}
        min_value: 最低价值得分阈值

    返回:
        list of dict: [{'outcome': str, 'model_prob': float, 'odds': float,
                        'implied_prob': float, 'value_score': float, 'level': str}]
    """
    bets = []
    for outcome in predictions:
        if outcome not in odds:
            continue
        model_prob = predictions[outcome]
        sp = odds[outcome]
        if sp is None or sp <= 1.0:
            continue

        imp = implied_prob(sp)
        vs = evaluate_value(model_prob, sp)

        # 过滤不靠谱的推荐
        if sp > MAX_ODDS_RECOMMEND:
            continue  # 赔率太高，冷门不推荐
        if model_prob < MIN_PROB_RECOMMEND:
            continue  # 模型概率太低，结果不太可能

        if vs >= min_value:
            bets.append({
                'outcome': outcome,
                'model_prob': model_prob,
                'odds': sp,
                'implied_prob': imp,
                'value_score': vs,
                'level': value_level(vs),
            })

    bets.sort(key=lambda x: x['value_score'], reverse=True)
    return bets
