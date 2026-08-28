const cron = require('node-cron');
const { initDatabase } = require('./utils/db');
const { fetchAndSaveMatches } = require('./jczq-500');
const { fetchMatchDetails } = require('./flashscore');
const logger = require('./utils/logger');

const db = initDatabase();

async function runMorningCollection() {
  logger.info('=== 每日早间采集开始 ===');
  try {
    const matches = await fetchAndSaveMatches(db);
    logger.info(`竞彩场次采集完成: ${matches.length} 场`);

    for (const match of matches) {
      try {
        await fetchMatchDetails(db, match.matchId, match.homeTeam, match.awayTeam);
        await new Promise(r => setTimeout(r, 2000)); // 间隔 2 秒
      } catch (e) {
        logger.error(`采集 ${match.matchId} 详情失败: ${e.message}`);
      }
    }

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
cron.schedule('0 8 * * *', runMorningCollection);   // 每天 08:00
cron.schedule('0 12 * * *', runOddsUpdate);          // 每天 12:00
cron.schedule('0 * * * *', runOddsUpdate);           // 每小时更新赔率

logger.info('竞彩数据采集调度器已启动');

// 也支持手动运行
if (process.argv.includes('--now')) {
  runMorningCollection().then(() => process.exit(0));
}

module.exports = { runMorningCollection, runOddsUpdate };
