const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/jingcai.db');

router.get('/', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const recs = db.prepare(`
      SELECT * FROM recommendations WHERE rec_date = ? ORDER BY rec_type, total_odds DESC
    `).all(date);

    const parsed = recs.map(r => {
      const legs = JSON.parse(r.matches_json || '[]');
      const enriched = legs.map(leg => {
        const match = db.prepare('SELECT home_team, away_team, league_name FROM matches WHERE match_id = ?').get(leg.match_id);
        return {
          ...leg,
          home_team: match ? match.home_team : '',
          away_team: match ? match.away_team : '',
          league_name: match ? match.league_name : '',
        };
      });
      return { ...r, matches_json: enriched };
    });

    res.json({ success: true, date, recommendations: parsed });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

router.get('/stats', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as losses,
        SUM(stake) as total_stake,
        SUM(COALESCE(actual_payout, 0)) as total_payout
      FROM recommendations
    `).get();

    stats.win_rate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : 0;
    stats.roi = stats.total_stake > 0
      ? ((stats.total_payout - stats.total_stake) / stats.total_stake * 100).toFixed(1)
      : 0;

    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

module.exports = router;
