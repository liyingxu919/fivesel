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

// API 路由
try {
  const matchesRouter = require('./server/routes/matches');
  app.use('/api/matches', matchesRouter);
  console.log('Matches router loaded');
} catch(e) {
  console.error('Matches router error:', e.message);
}

try {
  const recommendationsRouter = require('./server/routes/recommendations');
  app.use('/api/recommendations', recommendationsRouter);
  console.log('Recommendations router loaded');
} catch(e) {
  console.error('Recommendations router error:', e.message);
}

try {
  const matchDetailsRouter = require('./server/routes/match_details');
  app.use('/api/match-details', matchDetailsRouter);
  console.log('Match details router loaded');
} catch(e) {
  console.error('Match details router error:', e.message);
}

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
