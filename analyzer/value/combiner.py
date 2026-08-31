"""串关组合生成器"""
import itertools
from config import DAILY_BUDGET, COMBO3_COUNT, COMBO4_COUNT, SCORE_COMBO_COUNT, STAKE_PER_COMBO


def generate_combos(all_value_bets, score_value_bets=None, budget=DAILY_BUDGET):
    """
    生成每日投注方案

    参数:
        all_value_bets: 所有玩法的价值投注列表
        score_value_bets: 比分玩法的价值投注列表
        budget: 每日预算

    返回:
        dict: {
            'main': [{'type': '串3', 'bets': [...], 'total_odds': float, 'stake': float}],
            'backup': [{'type': '串4', 'bets': [...], 'total_odds': float, 'stake': float}],
            'score': [{'type': '比分串', 'bets': [...], 'total_odds': float, 'stake': float}],
            'total_stake': float,
        }
    """
    result = {'main': [], 'backup': [], 'score': [], 'total_stake': 0}

    # 按价值得分排序
    sorted_bets = sorted(all_value_bets, key=lambda x: x['value_score'], reverse=True)

    # 筛选赔率 > 2.0 的（博冷）
    cold_bets = [b for b in sorted_bets if b['odds'] >= 2.0]

    # 生成串3（主力方案）
    if len(cold_bets) >= 3:
        used_combos = set()
        for combo in itertools.combinations(cold_bets[:8], 3):
            # 避免同一联赛选太多
            leagues = set(b.get('league', '') for b in combo)
            if len(leagues) < 2:
                continue

            combo_key = tuple(sorted(b['match_id'] for b in combo))
            if combo_key in used_combos:
                continue
            used_combos.add(combo_key)

            total_odds = 1.0
            for b in combo:
                total_odds *= b['odds']

            ev = 1.0
            for b in combo:
                ev *= b['model_prob']

            result['main'].append({
                'type': '串3',
                'bets': list(combo),
                'total_odds': round(total_odds, 2),
                'expected_value': round(ev * total_odds, 2),
                'stake': STAKE_PER_COMBO,
            })

            if len(result['main']) >= COMBO3_COUNT:
                break

    # 生成串4（辅助方案）
    if len(cold_bets) >= 4:
        used_combos = set()
        for combo in itertools.combinations(cold_bets[:10], 4):
            leagues = set(b.get('league', '') for b in combo)
            if len(leagues) < 2:
                continue

            combo_key = tuple(sorted(b['match_id'] for b in combo))
            if combo_key in used_combos:
                continue
            used_combos.add(combo_key)

            total_odds = 1.0
            for b in combo:
                total_odds *= b['odds']

            result['backup'].append({
                'type': '串4',
                'bets': list(combo),
                'total_odds': round(total_odds, 2),
                'stake': STAKE_PER_COMBO,
            })

            if len(result['backup']) >= COMBO4_COUNT:
                break

    # 比分串
    if score_value_bets and len(score_value_bets) >= 2:
        sorted_scores = sorted(score_value_bets, key=lambda x: x['value_score'], reverse=True)
        combo = sorted_scores[:3]
        total_odds = 1.0
        for b in combo:
            total_odds *= b['odds']

        result['score'].append({
            'type': '比分串',
            'bets': combo,
            'total_odds': round(total_odds, 2),
            'stake': STAKE_PER_COMBO,
        })

    # 计算总投入
    result['total_stake'] = (
        len(result['main']) * STAKE_PER_COMBO +
        len(result['backup']) * STAKE_PER_COMBO +
        len(result['score']) * STAKE_PER_COMBO
    )

    return result
