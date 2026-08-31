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

    prediction = model.predict(features)

    # 找价值投注
    spf_odds = {
        'home': features['sp_home'],
        'draw': features['sp_draw'],
        'away': features['sp_away'],
    }
    spf_values = find_value_bets(prediction['spf_probs'], spf_odds)

    # 总进球价值
    goals_values = []
    for goals, prob in prediction['total_goals_probs'].items():
        # 需要总进球赔率，暂跳过
        pass

    # 比分价值
    score_values = []
    for score, prob in prediction['score_probs'].items():
        if prob > 0.03:  # 概率 > 3% 的比分
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
        'prediction': prediction,
        'spf_values': spf_values,
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

    all_spf_values = []
    all_score_values = []

    for match_id in match_ids:
        analysis = analyze_match(model, db, match_id)
        if analysis:
            save_prediction(db, match_id, analysis)
            for v in analysis['spf_values']:
                v['match_id'] = match_id
                v['league'] = analysis['league']
                v['home_team'] = analysis['home_team']
                v['away_team'] = analysis['away_team']
            all_spf_values.extend(analysis['spf_values'])
            all_score_values.extend(analysis['score_values'])

    # 生成串关方案
    combos = generate_combos(all_spf_values, all_score_values)
    save_recommendations(db, date_str, combos)

    # 输出结果
    print(f'\n=== 推荐方案 ===')
    print(f'总投入: {combos["total_stake"]} 元\n')

    for combo in combos['main']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b["odds"]} | 价值: {b["value_score"]:.2f}')
        print()

    for combo in combos['backup']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b["odds"]} | 价值: {b["value_score"]:.2f}')
        print()

    for combo in combos['score']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b.get("odds", "?")} | 概率: {b["model_prob"]:.1%}')
        print()

    db.close()
    print('分析完成!')


if __name__ == '__main__':
    date_arg = sys.argv[1] if len(sys.argv) > 1 else 'today'
    run_analysis(date_arg)
