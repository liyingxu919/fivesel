const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/jingcai.db');

router.get('/', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const matches = db.prepare(`
      SELECT m.*, o.sp_home, o.sp_draw, o.sp_away,
             o.sp_handicap_home, o.sp_handicap_draw, o.sp_handicap_away,
             p.prob_home, p.prob_draw, p.prob_away,
             p.value_spf_json, p.confidence
      FROM matches m
      LEFT JOIN odds_snapshots o ON m.match_id = o.match_id
      LEFT JOIN predictions p ON m.match_id = p.match_id
      WHERE m.match_date = ?
      ORDER BY m.match_time
    `).all(date);

    res.json({ success: true, date, count: matches.length, matches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

module.exports = router;
