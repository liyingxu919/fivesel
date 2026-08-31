const cron = require('node-cron');
const { initDatabase } = require('./utils/db');
const { fetchAndSaveMatches } = require('./jczq-500');
const { fetchMatchDetails, generateMatchDetailsFromProfiles } = require('./flashscore');
const { fetchAndSaveExtra } = require('./jczq-extra');
const { fetchAllTeamAnalysis } = require('./team-analysis');
const logger = require('./utils/logger');

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
          // FlashScore失败时使用本地资料库
          generateMatchDetailsFromProfiles(db, match.matchId, match.homeTeam, match.awayTeam);
        }
        await new Promise(r => setTimeout(r, 2000)); // 间隔 2 秒
      } catch (e) {
        logger.error(`采集 ${match.matchId} 详情失败: ${e.message}`);
        generateMatchDetailsFromProfiles(db, match.matchId, match.homeTeam, match.awayTeam);
      }
    }

    // 采集额外玩法赔率（比分、进球、半全场）
    await fetchAndSaveExtra(db);

    // 采集球队分析数据（近期战绩、联赛排名、赔率分析）
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
cron.schedule('0 8 * * *', runMorningCollection);   // 每天 08:00
cron.schedule('0 12 * * *', runOddsUpdate);          // 每天 12:00
cron.schedule('0 0-7,9-23 * * *', runOddsUpdate);    // 每小时更新赔率 (跳过 08:00 避免与早间采集重叠)

logger.info('竞彩数据采集调度器已启动');

// 也支持手动运行
if (process.argv.includes('--now')) {
  runMorningCollection().then(() => process.exit(0));
}

module.exports = { runMorningCollection, runOddsUpdate };
