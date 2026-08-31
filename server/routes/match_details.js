const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/jingcai.db');

router.get('/:matchId', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const details = db.prepare(`
      SELECT * FROM match_details WHERE match_id = ?
    `).get(req.params.matchId);

    if (!details) {
      return res.json({ success: true, match_id: req.params.matchId, details: null });
    }

    const homeProfile = JSON.parse(details.home_form_json || 'null');
    const awayProfile = JSON.parse(details.away_form_json || 'null');
    const h2h = JSON.parse(details.h2h_json || 'null');
    const fullStats = JSON.parse(details.home_stats_json || 'null');

    const parsed = {
      match_id: details.match_id,
      home_profile: homeProfile,  // 来自team_profiles.json的球队资料
      away_profile: awayProfile,
      h2h: h2h,
      // 来自team-analysis.js的500.com近期战绩和赔率分析
      home_form: fullStats && fullStats.homeForm ? fullStats.homeForm : null,
      away_form: fullStats && fullStats.awayForm ? fullStats.awayForm : null,
      odds_analysis: fullStats && fullStats.oddsAnalysis ? fullStats.oddsAnalysis : null,
      home_standings: fullStats && fullStats.homeStandings ? fullStats.homeStandings : null,
      away_standings: fullStats && fullStats.awayStandings ? fullStats.awayStandings : null,
    };

    res.json({ success: true, ...parsed });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

module.exports = router;
