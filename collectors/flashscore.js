const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const SEARCH_API = 'https://s.livesport.services/api/v2/search/';
const MATCH_API = 'https://local-global.flashscore.ninja/2/x/feed/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'Accept': 'application/json',
  'x-fsign': 'SW9D1eZo',
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 加载中英文队名映射
const mappingPath = path.join(__dirname, 'team_mapping.json');
let TEAM_MAPPING = {};
try {
  TEAM_MAPPING = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} catch (e) {
  logger.warn('队名映射文件加载失败，将使用中文名直接搜索');
}

// 加载球队资料
const profilesPath = path.join(__dirname, 'team_profiles.json');
let TEAM_PROFILES = {};
try {
  TEAM_PROFILES = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
} catch (e) {
  logger.warn('球队资料文件加载失败');
}

async function searchTeam(teamName) {
  // 优先使用英文名映射搜索
  const englishName = TEAM_MAPPING[teamName] || teamName;

  try {
    const resp = await axios.get(SEARCH_API, {
      params: {
        q: englishName,
        'lang-id': 13,
        'type-ids': '1,2,3,4',
        'project-id': 202,
        'project-type-id': 1,
      },
      headers: HEADERS,
      timeout: 10000,
    });

    const teams = (resp.data || [])
      .filter(item => item.sport && item.sport.id === 1 && item.type && item.type.id === 2)
      .map(item => ({
        id: item.id,
        name: item.name,
        country: item.country ? item.country.name : '',
      }));

    return teams;
  } catch (e) {
    logger.error(`FlashScore 搜索队伍失败: ${teamName}(${englishName}) - ${e.message}`);
    return [];
  }
}

async function fetchTeamResults(teamId) {
  try {
    const resp = await axios.get(`${MATCH_API}team_results_${teamId}`, {
      headers: HEADERS,
      timeout: 10000,
    });
    return resp.data;
  } catch (e) {
    logger.error(`FlashScore 获取队伍战绩失败: ${teamId} - ${e.message}`);
    return null;
  }
}

async function fetchH2H(homeTeamId, awayTeamId) {
  try {
    const resp = await axios.get(`${MATCH_API}h2h_${homeTeamId}_${awayTeamId}`, {
      headers: HEADERS,
      timeout: 10000,
    });
    return resp.data;
  } catch (e) {
    logger.error(`FlashScore 获取 H2H 失败: ${homeTeamId} vs ${awayTeamId} - ${e.message}`);
    return null;
  }
}

function saveMatchDetails(db, matchId, details) {
  db.prepare(`
    INSERT INTO match_details (match_id, home_form_json, away_form_json, h2h_json,
      home_stats_json, away_stats_json, standings_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      home_form_json=excluded.home_form_json, away_form_json=excluded.away_form_json,
      h2h_json=excluded.h2h_json, home_stats_json=excluded.home_stats_json,
      away_stats_json=excluded.away_stats_json, standings_json=excluded.standings_json
  `).run(
    matchId,
    JSON.stringify(details.homeForm || null),
    JSON.stringify(details.awayForm || null),
    JSON.stringify(details.h2h || null),
    JSON.stringify(details.homeStats || null),
    JSON.stringify(details.awayStats || null),
    JSON.stringify(details.standings || null)
  );
}

async function fetchMatchDetails(db, matchId, homeTeam, awayTeam) {
  logger.info(`采集 FlashScore 数据: ${homeTeam} vs ${awayTeam}`);

  // Resolve team names to numeric IDs via search API
  const homeTeams = await searchTeam(homeTeam);
  await sleep(1000);
  const awayTeams = await searchTeam(awayTeam);
  await sleep(1000);

  if (!homeTeams.length) {
    logger.error(`FlashScore 未找到主队: ${homeTeam}`);
    return null;
  }
  if (!awayTeams.length) {
    logger.error(`FlashScore 未找到客队: ${awayTeam}`);
    return null;
  }

  const homeTeamId = homeTeams[0].id;
  const awayTeamId = awayTeams[0].id;
  logger.info(`FlashScore ID: ${homeTeam}=${homeTeamId}, ${awayTeam}=${awayTeamId}`);

  const homeResults = await fetchTeamResults(homeTeamId);
  await sleep(1000);
  const awayResults = await fetchTeamResults(awayTeamId);
  await sleep(1000);
  const h2h = await fetchH2H(homeTeamId, awayTeamId);

  const details = {
    homeForm: homeResults,
    awayForm: awayResults,
    h2h: h2h,
    homeStats: null,
    awayStats: null,
    standings: null,
  };

  saveMatchDetails(db, matchId, details);
  logger.info(`FlashScore 数据已保存: ${matchId}`);
  return details;
}

/**
 * 从本地球队资料库生成比赛详情（当FlashScore API不可用时使用）
 */
function generateMatchDetailsFromProfiles(db, matchId, homeTeam, awayTeam) {
  const homeProfile = TEAM_PROFILES[homeTeam];
  const awayProfile = TEAM_PROFILES[awayTeam];

  if (!homeProfile && !awayProfile) {
    return null;
  }

  const details = {
    homeProfile: homeProfile || null,
    awayProfile: awayProfile || null,
    h2h: null,
  };

  db.prepare(`
    INSERT INTO match_details (match_id, home_form_json, away_form_json, h2h_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      home_form_json=excluded.home_form_json,
      away_form_json=excluded.away_form_json
  `).run(
    matchId,
    JSON.stringify(details.homeProfile),
    JSON.stringify(details.awayProfile),
    null
  );

  logger.info(`从本地资料库生成比赛详情: ${matchId}`);
  return details;
}

module.exports = {
  searchTeam,
  fetchTeamResults,
  fetchH2H,
  saveMatchDetails,
  fetchMatchDetails,
  generateMatchDetailsFromProfiles,
};
