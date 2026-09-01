/**
 * 竞彩足球分析系统 - 统一入口
 * Uses sql.js (pure JavaScript SQLite) - no native modules
 */
console.log('Starting Jingcai Football Analyzer v4 (sql.js)...');
console.log('Node version:', process.version);
console.log('Environment PORT:', process.env.PORT);

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: 'v4-sqljs' });
});

// 静态文件
app.use(express.static(path.join(__dirname, 'web')));

// API Routes
app.get('/api/matches', async (req, res) => {
  const { getDatabase } = require('./collectors/utils/db');
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const { fetchAndSaveMatches } = require('./collectors/jczq-500');
    const { fetchAndSaveExtra } = require('./collectors/jczq-extra');

    const db = getDatabase();
    await fetchAndSaveMatches(db);
    await fetchAndSaveExtra(db);

    const matches = db.prepare(`
      SELECT m.*, o.sp_home, o.sp_draw, o.sp_away,
             o.sp_handicap_home, o.sp_handicap_draw, o.sp_handicap_away,
             o.score_odds_json, o.goals_odds_json, o.half_odds_json,
             p.prob_home, p.prob_draw, p.prob_away,
             p.value_spf_json, p.confidence
      FROM matches m
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY snapshot_time DESC) as rn
        FROM odds_snapshots
      ) o ON m.match_id = o.match_id AND o.rn = 1
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY created_at DESC) as rn
        FROM predictions
      ) p ON m.match_id = p.match_id AND p.rn = 1
      WHERE m.match_date = ?
      ORDER BY m.match_time
    `).all(date);
    db.close();
    res.json({ success: true, date, count: matches.length, matches });
  } catch (e) {
    console.error('Matches API error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/recommendations', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const { generateRecommendations } = require('./collectors/recommendation-generator');
    const { getDatabase } = require('./collectors/utils/db');

    // Collect data and generate recommendations in one go
    const { fetchAndSaveMatches } = require('./collectors/jczq-500');
    const { fetchAndSaveExtra } = require('./collectors/jczq-extra');

    const db = getDatabase();
    await fetchAndSaveMatches(db);
    await fetchAndSaveExtra(db);

    const combos = generateRecommendations(db, date);
    db.close();

    // Format response
    const allRecs = [];
    for (const recType of ['main', 'backup', 'score']) {
      for (const combo of (combos[recType] || [])) {
        allRecs.push({
          rec_type: recType,
          matches_json: combo.bets,
          total_odds: combo.total_odds,
          stake: combo.stake,
          expected_value: combo.expected_value || 0,
          type: combo.type,
        });
      }
    }

    res.json({
      success: true,
      date,
      recommendations: allRecs,
      analyses: combos.analyses || [], // 每场比赛的详细分析
    });
  } catch (e) {
    console.error('Recommendations API error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/recommendations/stats', async (req, res) => {
  const { getReadonlyDatabase } = require('./collectors/utils/db');
  try {
    const db = getReadonlyDatabase();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as losses,
        SUM(stake) as total_stake,
        SUM(COALESCE(actual_payout, 0)) as total_payout
      FROM recommendations
    `).get();
    db.close();
    if (stats) {
      stats.win_rate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : 0;
      stats.roi = stats.total_stake > 0
        ? ((stats.total_payout - stats.total_stake) / stats.total_stake * 100).toFixed(1)
        : 0;
    }
    res.json({ success: true, stats: stats || { total: 0, wins: 0, losses: 0 } });
  } catch (e) {
    console.error('Stats API error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/match-details/:matchId', async (req, res) => {
  const { getReadonlyDatabase } = require('./collectors/utils/db');
  try {
    const db = getReadonlyDatabase();
    const details = db.prepare('SELECT * FROM match_details WHERE match_id = ?').get(req.params.matchId);
    db.close();
    if (!details) {
      return res.json({ success: true, match_id: req.params.matchId, details: null });
    }
    const homeProfile = JSON.parse(details.home_form_json || 'null');
    const awayProfile = JSON.parse(details.away_form_json || 'null');
    const h2h = JSON.parse(details.h2h_json || 'null');
    const fullStats = JSON.parse(details.home_stats_json || 'null');
    res.json({
      success: true,
      match_id: details.match_id,
      home_profile: homeProfile,
      away_profile: awayProfile,
      h2h: h2h,
      home_form: fullStats && fullStats.homeForm ? fullStats.homeForm : null,
      away_form: fullStats && fullStats.awayForm ? fullStats.awayForm : null,
      odds_analysis: fullStats && fullStats.oddsAnalysis ? fullStats.oddsAnalysis : null,
      home_standings: fullStats && fullStats.homeStandings ? fullStats.homeStandings : null,
      away_standings: fullStats && fullStats.awayStandings ? fullStats.awayStandings : null,
    });
  } catch (e) {
    console.error('Match details API error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manual data collection endpoint
app.post('/api/collect', async (req, res) => {
  try {
    const { fetchAndSaveMatches } = require('./collectors/jczq-500');
    const { fetchAndSaveExtra } = require('./collectors/jczq-extra');
    const { fetchAllTeamAnalysis } = require('./collectors/team-analysis');
    const { generateRecommendations, saveRecommendations } = require('./collectors/recommendation-generator');
    const { getDatabase } = require('./collectors/utils/db');

    const db = getDatabase();
    const matches = await fetchAndSaveMatches(db);
    await fetchAndSaveExtra(db);
    await fetchAllTeamAnalysis(db);

    const dateStr = new Date().toISOString().split('T')[0];
    const combos = generateRecommendations(db, dateStr);
    saveRecommendations(db, dateStr, combos);
    db.close();

    res.json({
      success: true,
      matches_collected: matches.length,
      recommendations: combos.main.length + combos.backup.length + combos.score.length,
    });
  } catch (e) {
    console.error('Manual collection error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manual recommendation generation endpoint
app.post('/api/generate-recommendations', async (req, res) => {
  const { getDatabase } = require('./collectors/utils/db');
  const { generateRecommendations, saveRecommendations } = require('./collectors/recommendation-generator');
  try {
    const db = getDatabase();
    const dateStr = req.body.date || new Date().toISOString().split('T')[0];
    const combos = generateRecommendations(db, dateStr);
    saveRecommendations(db, dateStr, combos);
    db.close();
    res.json({
      success: true,
      date: dateStr,
      main: combos.main.length,
      backup: combos.backup.length,
      score: combos.score.length,
      total_stake: combos.total_stake,
    });
  } catch (e) {
    console.error('Generate recommendations error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

console.log('API routes registered');

// Start server
async function main() {
  const { initDatabaseAsync } = require('./collectors/utils/db');

  try {
    await initDatabaseAsync();
    console.log('Database initialized');

    // Generate recommendations on startup if missing for today
    try {
      const { getDatabase } = require('./collectors/utils/db');
      const { generateRecommendations, saveRecommendations } = require('./collectors/recommendation-generator');
      const db = getDatabase();
      const dateStr = new Date().toISOString().split('T')[0];
      const existing = db.prepare('SELECT COUNT(*) as count FROM recommendations WHERE rec_date = ?').get(dateStr);
      if (!existing || existing.count === 0) {
        const combos = generateRecommendations(db, dateStr);
        if (combos.main.length + combos.backup.length + combos.score.length > 0) {
          saveRecommendations(db, dateStr, combos);
          console.log(`Generated ${combos.main.length + combos.backup.length + combos.score.length} recommendation combos`);
        }
      } else {
        console.log(`Found ${existing.count} existing recommendations for today`);
      }
      db.close();
    } catch(e) {
      console.error('Recommendation generation error:', e.message);
    }
  } catch(e) {
    console.error('Database init error:', e.message);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    server.close(() => process.exit(0));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });

  // Data collection (optional, doesn't affect server)
  if (!process.env.VERCEL) {
    try {
      const cron = require('node-cron');
      const { fetchAndSaveMatches } = require('./collectors/jczq-500');
      const { fetchMatchDetails, generateMatchDetailsFromProfiles } = require('./collectors/flashscore');
      const { fetchAndSaveExtra } = require('./collectors/jczq-extra');
      const { fetchAllTeamAnalysis } = require('./collectors/team-analysis');
      const { generateRecommendations, saveRecommendations } = require('./collectors/recommendation-generator');
      const { getDatabase } = require('./collectors/utils/db');
      const logger = require('./collectors/utils/logger');

      async function runMorningCollection() {
        logger.info('=== Daily morning collection start ===');
        try {
          const db = getDatabase();
          const matches = await fetchAndSaveMatches(db);
          logger.info(`Match collection done: ${matches.length} matches`);

          for (const match of matches) {
            try {
              const result = await fetchMatchDetails(db, match.matchId, match.homeTeam, match.awayTeam);
              if (!result) {
                generateMatchDetailsFromProfiles(db, match.matchId, match.homeTeam, match.awayTeam);
              }
              await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
              logger.error(`Collection ${match.matchId} failed: ${e.message}`);
              generateMatchDetailsFromProfiles(db, match.matchId, match.homeTeam, match.awayTeam);
            }
          }

          await fetchAndSaveExtra(db);
          await fetchAllTeamAnalysis(db);

          // Generate recommendations
          const dateStr = new Date().toISOString().split('T')[0];
          const combos = generateRecommendations(db, dateStr);
          saveRecommendations(db, dateStr, combos);
          logger.info(`Recommendations generated: ${combos.main.length + combos.backup.length + combos.score.length} combos`);

          db.close();
          logger.info('=== Daily morning collection done ===');
        } catch (e) {
          logger.error(`Morning collection failed: ${e.message}`);
        }
      }

      async function runOddsUpdate() {
        logger.info('=== Odds update ===');
        try {
          const db = getDatabase();
          await fetchAndSaveMatches(db);
          // Regenerate recommendations with updated odds
          const dateStr = new Date().toISOString().split('T')[0];
          const combos = generateRecommendations(db, dateStr);
          saveRecommendations(db, dateStr, combos);
          db.close();
          logger.info('Odds update done');
        } catch (e) {
          logger.error(`Odds update failed: ${e.message}`);
        }
      }

      cron.schedule('0 8 * * *', runMorningCollection);
      cron.schedule('0 12 * * *', runOddsUpdate);
      cron.schedule('0 0-7,9-23 * * *', runOddsUpdate);
      logger.info('Scheduler started');

      setTimeout(() => {
        runMorningCollection().catch(e => logger.error(`Startup collection failed: ${e.message}`));
      }, 30000);
    } catch (e) {
      console.error('Scheduler start failed:', e.message);
    }
  }

  console.log('Jingcai Football Analyzer started successfully');
}

main();
