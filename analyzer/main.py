#!/usr/bin/env python3
"""竞彩分析主入口"""
import sys
import os
import json
import sqlite3
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from config import DB_PATH
from models.ensemble import EnsembleModel
from features.team_strength import extract_team_strength_features
from features.odds_features import extract_odds_features
from features.base import load_match_data, get_db
from value.evaluator import find_value_bets
from value.combiner import generate_combos


def estimate_handicap_probs(spf_probs, handicap):
    """
    估算让球后的胜平负概率

    handicap: 让球数（正=主队让球，负=客队让球）
    让球后，主队需要净胜 handicap+1 球才算赢
    """
    home = spf_probs.get('home', 0.33)
    draw = spf_probs.get('draw', 0.33)
    away = spf_probs.get('away', 0.33)

    if handicap == 0:
        return spf_probs

    if handicap > 0:
        # 主队让 handicap 球
        # 让球后主胜概率大幅下降
        factor = 0.5 ** handicap
        new_home = home * factor
        new_draw = draw * (1 + (1 - factor) * 0.5)
        new_away = away + (home - new_home) - (new_draw - draw)
        new_away = max(0.05, new_away)
    else:
        # 客队让球（handicap为负），相当于主队受让
        factor = 0.5 ** (-handicap)
        new_away = away * factor
        new_draw = draw * (1 + (1 - factor) * 0.5)
        new_home = home + (away - new_away) - (new_draw - draw)
        new_home = max(0.05, new_home)

    total = new_home + new_draw + new_away
    return {
        'home': max(0.01, new_home / total),
        'draw': max(0.01, new_draw / total),
        'away': max(0.01, new_away / total),
    }


def analyze_match(model, db, match_id):
    """分析单场比赛"""
    match = load_match_data(db, match_id)
    if not match:
        return None

    features = {}
    features.update(extract_team_strength_features(match))
    features.update(extract_odds_features(match))
    features['home_team'] = match.get('home_team', '')
    features['away_team'] = match.get('away_team', '')

    # 加入让球赔率
    odds = match.get('odds', {})
    features['sp_handicap_home'] = odds.get('sp_handicap_home')
    features['sp_handicap_draw'] = odds.get('sp_handicap_draw')
    features['sp_handicap_away'] = odds.get('sp_handicap_away')

    prediction = model.predict(features)

    # 找价值投注 — 胜平负
    spf_odds = {
        'home': features['sp_home'],
        'draw': features['sp_draw'],
        'away': features['sp_away'],
    }
    spf_values = find_value_bets(prediction['spf_probs'], spf_odds)

    # 找价值投注 — 让球胜平负
    handicap = match.get('handicap', 0)
    sp_handicap_home = features.get('sp_handicap_home')
    sp_handicap_draw = features.get('sp_handicap_draw')
    sp_handicap_away = features.get('sp_handicap_away')

    handicap_values = []
    if sp_handicap_home and sp_handicap_draw and sp_handicap_away:
        # 让球后的胜平负概率需要调整
        # handicap > 0 表示主队让球，即主队实际要赢更多
        handicap_probs = estimate_handicap_probs(prediction['spf_probs'], handicap)
        handicap_odds = {
            'home': sp_handicap_home,
            'draw': sp_handicap_draw,
            'away': sp_handicap_away,
        }
        handicap_values = find_value_bets(handicap_probs, handicap_odds)
        for v in handicap_values:
            v['handicap'] = handicap
            v['play_type'] = 'handicap'

    # 总进球价值（暂跳过，无赔率数据）
    goals_values = []

    # 比分价值
    score_values = []
    for score, prob in prediction['score_probs'].items():
        if prob > 0.03:
            score_values.append({
                'match_id': match_id,
                'outcome': score,
                'model_prob': prob,
                'league': match.get('league_name', ''),
                'home_team': match.get('home_team', ''),
                'away_team': match.get('away_team', ''),
            })

    return {
        'match_id': match_id,
        'home_team': match.get('home_team'),
        'away_team': match.get('away_team'),
        'league': match.get('league_name'),
        'handicap': handicap,
        'prediction': prediction,
        'spf_values': spf_values,
        'handicap_values': handicap_values,
        'score_values': score_values,
    }


def save_prediction(db, match_id, analysis, model_version='v1'):
    """保存预测结果到数据库"""
    pred = analysis['prediction']
    db.execute('''
        INSERT INTO predictions (match_id, model_version,
            prob_home, prob_draw, prob_away,
            prob_goals_json, prob_scores_json,
            value_spf_json, value_scores_json, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        match_id, model_version,
        pred['spf_probs']['home'],
        pred['spf_probs']['draw'],
        pred['spf_probs']['away'],
        json.dumps(pred['total_goals_probs']),
        json.dumps(pred['score_probs']),
        json.dumps(analysis['spf_values']),
        json.dumps(analysis['score_values']),
        0.5,  # 默认置信度
    ))
    db.commit()


def save_recommendations(db, date_str, combos):
    """保存推荐方案到数据库"""
    for rec_type in ['main', 'backup', 'score']:
        for combo in combos.get(rec_type, []):
            db.execute('''
                INSERT INTO recommendations (rec_date, rec_type, matches_json,
                    total_odds, stake, expected_value)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                date_str, rec_type,
                json.dumps([{
                    'match_id': b.get('match_id'),
                    'outcome': b.get('outcome'),
                    'odds': b.get('odds'),
                    'value_score': b.get('value_score'),
                    'play_type': b.get('play_type', 'spf'),
                    'handicap': b.get('handicap', 0),
                } for b in combo['bets']]),
                combo['total_odds'],
                combo['stake'],
                combo.get('expected_value', 0),
            ))
    db.commit()


def run_analysis(date_str=None):
    """运行完整分析流程"""
    if date_str is None or date_str == 'today':
        date_str = datetime.now().strftime('%Y-%m-%d')

    print(f'=== 竞彩分析 {date_str} ===')

    db = get_db()
    model = EnsembleModel()

    # 从历史数据初始化 Elo 评分
    model.elo.init_from_db(db)

    # 获取当日比赛
    cursor = db.execute(
        "SELECT match_id FROM matches WHERE match_date = ? AND status = 'notstarted'",
        (date_str,)
    )
    match_ids = [row[0] for row in cursor.fetchall()]

    if not match_ids:
        print('今日无竞彩比赛')
        return

    print(f'分析 {len(match_ids)} 场比赛...')

    all_value_bets = []
    all_score_values = []

    for match_id in match_ids:
        analysis = analyze_match(model, db, match_id)
        if analysis:
            save_prediction(db, match_id, analysis)
            # 胜平负价值投注
            for v in analysis['spf_values']:
                v['match_id'] = match_id
                v['league'] = analysis['league']
                v['home_team'] = analysis['home_team']
                v['away_team'] = analysis['away_team']
                v['play_type'] = 'spf'
            all_value_bets.extend(analysis['spf_values'])
            # 让球价值投注
            for v in analysis['handicap_values']:
                v['match_id'] = match_id
                v['league'] = analysis['league']
                v['home_team'] = analysis['home_team']
                v['away_team'] = analysis['away_team']
            all_value_bets.extend(analysis['handicap_values'])
            # 比分
            all_score_values.extend(analysis['score_values'])

    # 生成串关方案
    combos = generate_combos(all_value_bets, all_score_values)
    save_recommendations(db, date_str, combos)

    # 输出结果
    print(f'\n=== 推荐方案 ===')
    print(f'总投入: {combos["total_stake"]} 元\n')

    for combo in combos['main']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            pt = b.get('play_type', 'spf')
            hc = b.get('handicap', 0)
            label = f'让球({hc:+d})' if pt == 'handicap' else ''
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {label}{b["outcome"]} @ {b["odds"]} | 价值: {b["value_score"]:.2f}')
        print()

    for combo in combos['backup']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            pt = b.get('play_type', 'spf')
            hc = b.get('handicap', 0)
            label = f'让球({hc:+d})' if pt == 'handicap' else ''
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {label}{b["outcome"]} @ {b["odds"]} | 价值: {b["value_score"]:.2f}')
        print()

    for combo in combos['score']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b.get("odds", "?")} | 概率: {b["model_prob"]:.1%}')
        print()

    # 保存 Elo 评分
    model.elo.save()

    db.close()
    print('分析完成!')


if __name__ == '__main__':
    date_arg = sys.argv[1] if len(sys.argv) > 1 else 'today'
    run_analysis(date_arg)
