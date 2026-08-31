/**
 * 竞彩足球分析系统 - 统一入口
 */
console.log('Starting Jingcai Football Analyzer...');
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

// 最简单的健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 静态文件
app.use(express.static(path.join(__dirname, 'web')));

// 初始化数据库
try {
  const { initDatabase } = require('./collectors/utils/db');
  const db = initDatabase();
  db.close();
  console.log('Database initialized');
} catch(e) {
  console.error('Database init error:', e.message);
}

// API 路由 - inline to avoid require issues
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, 'data/jingcai.db');

console.log('DB_PATH:', DB_PATH);
console.log('DB exists:', require('fs').existsSync(DB_PATH));

app.get('/api/matches', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const db = new Database(DB_PATH, { readonly: true });
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

app.get('/api/recommendations', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const recs = db.prepare('SELECT * FROM recommendations WHERE rec_date = ? ORDER BY rec_type, total_odds DESC').all(date);
    const parsed = recs.map(r => {
      const legs = JSON.parse(r.matches_json || '[]');
      const enriched = legs.map(leg => {
        const match = db.prepare('SELECT home_team, away_team, league_name FROM matches WHERE match_id = ?').get(leg.match_id);
        return { ...leg, home_team: match ? match.home_team : '', away_team: match ? match.away_team : '', league_name: match ? match.league_name : '' };
      });
      return { ...r, matches_json: enriched };
    });
    db.close();
    res.json({ success: true, date, recommendations: parsed });
  } catch (e) {
    console.error('Recommendations API error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/match-details/:matchId', (req, res) => {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const details = db.prepare('SELECT * FROM match_details WHERE match_id = ?').get(req.params.matchId);
    db.close();
    if (!details) {
      return res.json({ success: true, match_id: req.params.matchId, details: null });
    }
    const homeProfile = JSON.parse(details.home_form_json || 'null');
    const awayProfile = JSON.parse(details.away_form_json || 'null');
    const h2h = JSON.parse(details.h2h_json || 'null');
    const fullStats = JSON.parse(details.home_stats_json || 'null');
    const parsed = {
      match_id: details.match_id,
      home_profile: homeProfile,
      away_profile: awayProfile,
      h2h: h2h,
      home_form: fullStats && fullStats.homeForm ? fullStats.homeForm : null,
      away_form: fullStats && fullStats.awayForm ? fullStats.awayForm : null,
      odds_analysis: fullStats && fullStats.oddsAnalysis ? fullStats.oddsAnalysis : null,
      home_standings: fullStats && fullStats.homeStandings ? fullStats.homeStandings : null,
      away_standings: fullStats && fullStats.awayStandings ? fullStats.awayStandings : null,
    };
    res.json({ success: true, ...parsed });
  } catch (e) {
    console.error('Match details API error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

console.log('API routes registered inline');

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});

// 保持进程运行
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

// 错误处理
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// 数据采集（可选，不影响服务器运行）
if (!process.env.VERCEL) {
  try {
    const cron = require('node-cron');
    const { initDatabase } = require('./collectors/utils/db');
    const { fetchAndSaveMatches } = require('./collectors/jczq-500');
    const { fetchMatchDetails, generateMatchDetailsFromProfiles } = require('./collectors/flashscore');
    const { fetchAndSaveExtra } = require('./collectors/jczq-extra');
    const { fetchAllTeamAnalysis } = require('./collectors/team-analysis');
    const logger = require('./collectors/utils/logger');

    const db = initDatabase();

    async function runMorningCollection() {
      logger.info('=== 每日早间采集开始 ===');
      try {
        const matches = await fetchAndSaveMatches(db);
        logger.info(`竞彩场次采集完成: ${matches.length} 场`);

        for (const match of matches) {
          try {
            const result = await fetchMatchDetails(db, match.matchId, match.homeTeam, match.awayTeam);
            if (!result) {
              generateMatchDetailsFromProfiles(db, match.matchId, match.homeTeam, match.awayTeam);
            }
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            logger.error(`采集 ${match.matchId} 详情失败: ${e.message}`);
            generateMatchDetailsFromProfiles(db, match.matchId, match.homeTeam, match.awayTeam);
          }
        }

        await fetchAndSaveExtra(db);
        await fetchAllTeamAnalysis(db);
        logger.info('=== 每日早间采集完成 ===');
      } catch (e) {
        logger.error(`早间采集失败: ${e.message}`);
      }
    }

    async function runOddsUpdate() {
      logger.info('=== 赔率更新采集 ===');
      try {
        await fetchAndSaveMatches(db);
        logger.info('赔率更新完成');
      } catch (e) {
        logger.error(`赔率更新失败: ${e.message}`);
      }
    }

    // 定时任务
    cron.schedule('0 8 * * *', runMorningCollection);
    cron.schedule('0 12 * * *', runOddsUpdate);
    cron.schedule('0 0-7,9-23 * * *', runOddsUpdate);

    logger.info('定时采集调度器已启动');

    // 延迟30秒后采集，确保Web服务先启动完成
    setTimeout(() => {
      runMorningCollection().catch(e => logger.error(`启动采集失败: ${e.message}`));
    }, 30000);
  } catch (e) {
    console.error('定时采集启动失败:', e.message);
  }
}

console.log('Jingcai Football Analyzer started successfully');
