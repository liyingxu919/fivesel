"""比赛结果反馈与学习"""
import json
import sqlite3
from config import DB_PATH


def record_result(db, match_id, home_score, away_score):
    """
    记录比赛结果并更新数据库

    返回: {'outcome': 'home'|'draw'|'away', 'total_goals': int}
    """
    db.execute('''
        UPDATE matches SET status = 'finished', home_score = ?, away_score = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE match_id = ?
    ''', (home_score, away_score, match_id))

    if home_score > away_score:
        outcome = 'home'
    elif home_score == away_score:
        outcome = 'draw'
    else:
        outcome = 'away'

    db.commit()
    return {'outcome': outcome, 'total_goals': home_score + away_score}


def evaluate_prediction(db, match_id):
    """
    评估预测结果

    返回: dict with prediction accuracy info
    """
    cursor = db.cursor()

    # 获取实际结果
    cursor.execute('SELECT home_score, away_score, status FROM matches WHERE match_id = ?', (match_id,))
    match = cursor.fetchone()
    if not match or match[2] != 'finished':
        return None

    home_score, away_score = match[0], match[1]
    if home_score > away_score:
        actual = 'home'
    elif home_score == away_score:
        actual = 'draw'
    else:
        actual = 'away'

    # 获取预测
    cursor.execute('''
        SELECT model_version, prob_home, prob_draw, prob_away, value_spf_json
        FROM predictions WHERE match_id = ? ORDER BY created_at DESC LIMIT 1
    ''', (match_id,))
    pred = cursor.fetchone()
    if not pred:
        return None

    model_version, prob_home, prob_draw, prob_away, value_json = pred

    probs = {'home': prob_home, 'draw': prob_draw, 'away': prob_away}
    predicted_prob = probs[actual]
    predicted_outcome = max(probs, key=probs.get)
    was_correct = predicted_outcome == actual

    # 获取当时赔率
    cursor.execute('''
        SELECT sp_home, sp_draw, sp_away FROM odds_snapshots
        WHERE match_id = ? ORDER BY snapshot_time DESC LIMIT 1
    ''', (match_id,))
    odds_row = cursor.fetchone()
    odds = {}
    if odds_row:
        odds = {'home': odds_row[0], 'draw': odds_row[1], 'away': odds_row[2]}

    actual_odds = odds.get(actual, 0)
    profit = (actual_odds - 1) if was_correct else -1

    # 写入学习日志
    db.execute('''
        INSERT INTO learning_log (match_id, model_version, predicted_outcome,
            predicted_prob, actual_outcome, was_correct, odds_at_time, profit_loss)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (match_id, model_version, predicted_outcome, predicted_prob,
          actual, was_correct, actual_odds, profit))
    db.commit()

    return {
        'match_id': match_id,
        'predicted': predicted_outcome,
        'actual': actual,
        'was_correct': was_correct,
        'predicted_prob': predicted_prob,
        'actual_odds': actual_odds,
        'profit': profit,
    }


def batch_evaluate(db, date_str):
    """批量评估某日所有已结束比赛"""
    cursor = db.execute('''
        SELECT match_id FROM matches
        WHERE match_date = ? AND status = 'finished'
    ''', (date_str,))

    results = []
    for row in cursor.fetchall():
        r = evaluate_prediction(db, row[0])
        if r:
            results.append(r)

    correct = sum(1 for r in results if r['was_correct'])
    total = len(results)
    accuracy = correct / total if total > 0 else 0

    return {
        'date': date_str,
        'total': total,
        'correct': correct,
        'accuracy': accuracy,
        'results': results,
    }
