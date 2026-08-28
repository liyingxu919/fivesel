const axios = require('axios');
const logger = require('./utils/logger');

const SEARCH_API = 'https://s.livesport.services/api/v2/search/';
const MATCH_API = 'https://local-global.flashscore.ninja/2/x/feed/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'Accept': 'application/json',
  'x-fsign': 'SW9D1eZo',
};

async function searchTeam(teamName) {
  try {
    const resp = await axios.get(SEARCH_API, {
      params: {
        q: teamName,
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
    logger.error(`FlashScore 搜索队伍失败: ${teamName} - ${e.message}`);
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

async function fetchMatchStats(flashscoreMatchId) {
  try {
    const resp = await axios.get(`${MATCH_API}match_stats_${flashscoreMatchId}`, {
      headers: HEADERS,
      timeout: 10000,
    });
    return resp.data;
  } catch (e) {
    logger.error(`FlashScore 获取比赛统计失败: ${flashscoreMatchId} - ${e.message}`);
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

  const [homeResults, awayResults, h2h] = await Promise.all([
    fetchTeamResults(homeTeam),
    fetchTeamResults(awayTeam),
    fetchH2H(homeTeam, awayTeam),
  ]);

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

module.exports = {
  searchTeam,
  fetchTeamResults,
  fetchMatchStats,
  fetchH2H,
  saveMatchDetails,
  fetchMatchDetails,
};
