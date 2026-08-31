/**
 * 竞彩足球分析系统 - 统一入口
 * 启动Web服务 + 定时数据采集
 */
console.log('Starting jingcai-football...');
try {
  const path = require('path');
  console.log('1. path loaded');
  const fs = require('fs');
  console.log('2. fs loaded');

  // 确保data目录存在
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  console.log('3. data dir ready');

  // 启动Web服务
  const express = require('express');
  console.log('4. express loaded');
  const cors = require('cors');
  console.log('5. cors loaded');
  const matchesRouter = require('./server/routes/matches');
  console.log('6. matches router loaded');
  const recommendationsRouter = require('./server/routes/recommendations');
  console.log('7. recommendations router loaded');
  const matchDetailsRouter = require('./server/routes/match_details');
  console.log('8. match_details router loaded');
} catch(e) {
  console.error('LOAD ERROR:', e.message, e.stack);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('未处理Promise:', err.message || err);
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(express.static(path.join(__dirname, 'web')));

app.use('/api/matches', matchesRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/match-details', matchDetailsRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`竞彩分析服务已启动: http://0.0.0.0:${PORT}`);
});

// 启动定时采集（仅在非Vercel/serverless环境）
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

module.exports = app;
