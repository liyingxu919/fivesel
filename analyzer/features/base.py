"""特征工程基类"""
import json
import sqlite3
from config import DB_PATH


def get_db(db_path=None):
    if db_path is None:
        db_path = DB_PATH
    return sqlite3.connect(db_path)


def load_match_data(db, match_id):
    """加载单场比赛的所有数据"""
    cursor = db.cursor()

    cursor.execute('SELECT * FROM matches WHERE match_id = ?', (match_id,))
    match = cursor.fetchone()
    if not match:
        return None

    columns = [d[0] for d in cursor.description]
    match_dict = dict(zip(columns, match))

    # 加载最新赔率
    cursor.execute('''
        SELECT * FROM odds_snapshots WHERE match_id = ?
        ORDER BY snapshot_time DESC LIMIT 1
    ''', (match_id,))
    odds = cursor.fetchone()
    if odds:
        odds_cols = [d[0] for d in cursor.description]
        match_dict['odds'] = dict(zip(odds_cols, odds))
    else:
        match_dict['odds'] = {}

    # 加载详细数据
    cursor.execute('SELECT * FROM match_details WHERE match_id = ?', (match_id,))
    details = cursor.fetchone()
    if details:
        detail_cols = [d[0] for d in cursor.description]
        match_dict['details'] = dict(zip(detail_cols, details))
    else:
        match_dict['details'] = {}

    return match_dict


def parse_json_field(value):
    """安全解析 JSON 字段"""
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None
