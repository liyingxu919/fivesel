"""Kelly 公式计算最优投注比例"""


def kelly_fraction(model_prob, odds_sp):
    """
    计算 Kelly 公式最优投注比例

    f* = (bp - q) / b
    b = odds - 1 (净收益)
    p = model probability
    q = 1 - p

    返回半 Kelly 以降低波动
    """
    if odds_sp <= 1.0 or model_prob <= 0 or model_prob >= 1:
        return 0.0

    b = odds_sp - 1.0
    p = model_prob
    q = 1.0 - p

    full_kelly = (b * p - q) / b
    if full_kelly <= 0:
        return 0.0

    # 使用半 Kelly 降低波动
    return full_kelly / 2.0


def calculate_stake(kelly_frac, budget, min_stake=2.0, max_stake=None):
    """
    根据 Kelly 比例计算实际投注金额

    参数:
        kelly_frac: Kelly 比例
        budget: 可用预算
        min_stake: 最低投注额
        max_stake: 最高投注额（默认为预算的 50%）
    """
    if max_stake is None:
        max_stake = budget * 0.5

    raw = budget * kelly_frac
    return max(min_stake, min(raw, max_stake))
