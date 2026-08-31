"""串关组合生成器"""
import itertools
from config import DAILY_BUDGET, COMBO3_COUNT, COMBO4_COUNT, SCORE_COMBO_COUNT, STAKE_PER_COMBO


def classify_bet(bet):
    """
    分类投注：
    - safe: 赔率<2.0 的稳胆
    - value: 赔率2.0-3.5 的价值投注
    - cold: 赔率>3.5 的纯冷门（不含让球）
    """
    if bet.get('play_type') == 'handicap':
        # 让球投注单独分类，不受cold限制
        return 'handicap'
    if bet['odds'] < 2.0:
        return 'safe'
    elif bet['odds'] < 3.5:
        return 'value'
    else:
        return 'cold'


def format_bet_label(bet):
    """
    格式化投注标签，区分胜平负和让球
    """
    play_type = bet.get('play_type', 'spf')
    outcome = bet.get('outcome', '')
    handicap = bet.get('handicap', 0)

    outcome_map = {'home': '主胜', 'draw': '平', 'away': '客胜'}
    label = outcome_map.get(outcome, outcome)

    if play_type == 'handicap':
        h_str = f'+{handicap}' if handicap > 0 else str(handicap)
        return f'让球({h_str}) {label}'
    return label


def is_valid_combo(combo, max_cold=1, max_handicap=1):
    """
    验证组合合理性：
    - 最多 max_cold 个冷门
    - 最多 max_handicap 个让球投注
    - 必须来自不同联赛
    - 总赔率不能太极端
    - 同一场比赛只能选一个投注
    """
    cold_count = sum(1 for b in combo if classify_bet(b) == 'cold')
    if cold_count > max_cold:
        return False

    # 让球投注最多1个（控制风险）
    handicap_count = sum(1 for b in combo if b.get('play_type') == 'handicap')
    if handicap_count > max_handicap:
        return False

    # 同一场比赛不能重复
    match_ids = [b.get('match_id') for b in combo]
    if len(set(match_ids)) < len(match_ids):
        return False

    leagues = set(b.get('league', '') for b in combo)
    if len(leagues) < len(combo) // 2 + 1:
        return False

    total_odds = 1.0
    for b in combo:
        total_odds *= b['odds']
    if total_odds > 50:  # 降低上限
        return False

    return True


def calculate_ev(combo):
    """计算组合期望值"""
    ev = 1.0
    for b in combo:
        ev *= b['model_prob']
    total_odds = 1.0
    for b in combo:
        total_odds *= b['odds']
    return ev * total_odds


def generate_combos(all_value_bets, score_value_bets=None, budget=DAILY_BUDGET):
    """
    生成每日投注方案

    策略：稳胆为主，适当搭配1个价值投注
    """
    result = {'main': [], 'backup': [], 'score': [], 'total_stake': 0}

    if not all_value_bets:
        return result

    # 按价值得分排序
    sorted_bets = sorted(all_value_bets, key=lambda x: x['value_score'], reverse=True)

    # 分类
    safe_bets = [b for b in sorted_bets if classify_bet(b) == 'safe']
    value_bets = [b for b in sorted_bets if classify_bet(b) == 'value']
    cold_bets = [b for b in sorted_bets if classify_bet(b) == 'cold']
    handicap_bets = [b for b in sorted_bets if classify_bet(b) == 'handicap']

    # 候选池：按类别取top，确保多样性
    # 稳胆最多取4个，价值取4个，让球取4个
    candidates = safe_bets[:4] + value_bets[:4] + handicap_bets[:4]
    # 按价值重新排序
    candidates.sort(key=lambda x: x['value_score'], reverse=True)

    # === 串3：1稳胆 + 1价值 + 1稳胆 或 2稳胆 + 1价值 ===
    if len(candidates) >= 3:
        used_combos = set()
        best_combos = []

        for combo in itertools.combinations(candidates[:10], 3):
            if not is_valid_combo(combo, max_cold=1):
                continue

            combo_key = tuple(sorted(b['match_id'] for b in combo))
            if combo_key in used_combos:
                continue
            used_combos.add(combo_key)

            total_odds = 1.0
            for b in combo:
                total_odds *= b['odds']
            ev = calculate_ev(combo)

            best_combos.append({
                'type': '串3',
                'bets': list(combo),
                'total_odds': round(total_odds, 2),
                'expected_value': round(ev, 2),
                'stake': STAKE_PER_COMBO,
            })

        # 按期望值排序取最优
        best_combos.sort(key=lambda x: x['expected_value'], reverse=True)
        result['main'] = best_combos[:COMBO3_COUNT]

    # === 串4：2稳胆 + 2价值 ===
    if len(candidates) >= 4:
        used_combos = set()
        best_combos = []

        for combo in itertools.combinations(candidates[:12], 4):
            if not is_valid_combo(combo, max_cold=1):
                continue

            combo_key = tuple(sorted(b['match_id'] for b in combo))
            if combo_key in used_combos:
                continue
            used_combos.add(combo_key)

            total_odds = 1.0
            for b in combo:
                total_odds *= b['odds']
            ev = calculate_ev(combo)

            best_combos.append({
                'type': '串4',
                'bets': list(combo),
                'total_odds': round(total_odds, 2),
                'expected_value': round(ev, 2),
                'stake': STAKE_PER_COMBO,
            })

        best_combos.sort(key=lambda x: x['expected_value'], reverse=True)
        result['backup'] = best_combos[:COMBO4_COUNT]

    # === 比分串 ===
    if score_value_bets and len(score_value_bets) >= 2:
        sorted_scores = sorted(score_value_bets, key=lambda x: x.get('value_score', x.get('model_prob', 0)), reverse=True)
        combo = sorted_scores[:3]
        total_odds = 1.0
        for b in combo:
            total_odds *= b.get('odds', 1.0)

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
