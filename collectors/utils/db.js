const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, '../../data/jingcai.db');

function getDatabase(dbPath = DEFAULT_DB_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initDatabase(dbPath = DEFAULT_DB_PATH) {
  const db = getDatabase(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      match_id TEXT PRIMARY KEY,
      match_date DATE,
      match_time TIME,
      buy_deadline DATETIME,
      league_name TEXT,
      home_team TEXT,
      away_team TEXT,
      home_rank INTEGER,
      away_rank INTEGER,
      handicap INTEGER DEFAULT 0,
      status TEXT DEFAULT 'notstarted',
      home_score INTEGER,
      away_score INTEGER,
      flashscore_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS odds_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(match_id),
      snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      sp_home REAL,
      sp_draw REAL,
      sp_away REAL,
      sp_handicap_home REAL,
      sp_handicap_draw REAL,
      sp_handicap_away REAL,
      sp_goals_0 REAL,
      sp_goals_1 REAL,
      sp_goals_2 REAL,
      sp_goals_3 REAL,
      sp_goals_4 REAL,
      sp_goals_5 REAL,
      sp_goals_6 REAL,
      sp_goals_7plus REAL,
      sp_scores_json TEXT,
      score_odds_json TEXT,
      goals_odds_json TEXT,
      half_odds_json TEXT
    );

    CREATE TABLE IF NOT EXISTS match_details (
      match_id TEXT PRIMARY KEY REFERENCES matches(match_id),
      home_form_json TEXT,
      away_form_json TEXT,
      h2h_json TEXT,
      home_stats_json TEXT,
      away_stats_json TEXT,
      standings_json TEXT,
      lineups_json TEXT,
      missing_players_json TEXT,
      weather TEXT,
      footballbin_prediction_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(match_id),
      model_version TEXT,
      prob_home REAL,
      prob_draw REAL,
      prob_away REAL,
      prob_handicap_home REAL,
      prob_handicap_draw REAL,
      prob_handicap_away REAL,
      prob_goals_json TEXT,
      prob_scores_json TEXT,
      value_spf_json TEXT,
      value_hhspf_json TEXT,
      value_goals_json TEXT,
      value_scores_json TEXT,
      confidence REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rec_date DATE,
      rec_type TEXT,
      matches_json TEXT,
      total_odds REAL,
      stake REAL,
      expected_value REAL,
      result TEXT DEFAULT 'pending',
      actual_payout REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS model_versions (
      version TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      features_json TEXT,
      hyperparams_json TEXT,
      accuracy REAL,
      log_loss REAL,
      roi REAL,
      brier_score REAL,
      is_active BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS learning_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      model_version TEXT,
      predicted_outcome TEXT,
      predicted_prob REAL,
      actual_outcome TEXT,
      was_correct BOOLEAN,
      odds_at_time REAL,
      profit_loss REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
    CREATE INDEX IF NOT EXISTS idx_recommendations_date ON recommendations(rec_date);
    CREATE INDEX IF NOT EXISTS idx_learning_match ON learning_log(match_id);
  `);

  return db;
}

module.exports = { getDatabase, initDatabase, DEFAULT_DB_PATH };
