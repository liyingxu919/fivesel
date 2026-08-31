/**
 * 从500.com球队页面采集近期战绩、联赛排名等分析数据
 * 同时基于赔率生成比赛分析
 */
const https = require('https');
const iconv = require('iconv-lite');
const logger = require('./utils/logger');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: HEADERS, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(iconv.decode(Buffer.concat(chunks), 'gb2312')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * 解析近期战绩表格
 */
function parseRecentForm(html) {
  const matches = [];
  const tbodyMatch = html.match(/近期战绩[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { matches, summary: '' };

  const rows = tbodyMatch[1].split('<tr').slice(1);
  for (const row of rows) {
    const league = (row.match(/<td[^>]*>.*?<a[^>]*>([^<]+)<\/a>/) || [])[1] || '';
    const date = (row.match(/class="td_time">([^<]+)/) || [])[1] || '';
    const teams = [];
    const teamMatches = row.matchAll(/class="td_[lr]team"[^>]*>.*?<a[^>]*>([^<]+)<\/a>/g);
    for (const t of teamMatches) teams.push(t[1]);
    const scoreMatch = row.match(/<span[^>]*>(\d+)<\/span>:\s*<span[^>]*>(\d+)<\/span>|(\d+):(\d+)/);
    let score = '';
    if (scoreMatch) {
      score = scoreMatch[1] != null ? `${scoreMatch[1]}:${scoreMatch[2]}` : `${scoreMatch[3]}:${scoreMatch[4]}`;
    }
    const resultMatch = row.match(/<span class="l(red|green|blue)">\s*<span[^>]*>(胜|平|负)<\/span>/);
    const result = resultMatch ? resultMatch[2] : '';

    if (date && (teams.length >= 1 || score)) {
      matches.push({ league, date, homeTeam: teams[0] || '', awayTeam: teams[1] || '', score, result });
    }
  }

  // 近10场统计
  const summaryMatch = html.match(/近\d+场战绩[^<]*<span[^>]*>(\d+)胜<\/span><span[^>]*>(\d+)平<\/span><span[^>]*>(\d+)负<\/span>\s*进<span[^>]*>(\d+)球<\/span>失<span[^>]*>(\d+)球/);
  let summary = '';
  if (summaryMatch) {
    summary = `近10场 ${summaryMatch[1]}胜${summaryMatch[2]}平${summaryMatch[3]}负 进${summaryMatch[4]}球失${summaryMatch[5]}球`;
  }

  return { matches, summary };
}

/**
 * 解析联赛排名
 */
function parseStandings(html) {
  const standings = [];
  const tableMatch = html.match(/联赛排名[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tableMatch) return standings;

  const rows = tableMatch[1].split('<tr').slice(1);
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/g) || [];
    const vals = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    if (vals.length >= 7) {
      standings.push({
        rank: vals[0], team: vals[1], played: vals[2],
        win: vals[3], draw: vals[4], loss: vals[5], points: vals[6],
      });
    }
  }
  return standings;
}

/**
 * 从500.com采集单支球队的分析数据
 */
async function fetchTeamAnalysis(teamId) {
  const url = `https://liansai.500.com/team/${teamId}/`;
  try {
    const html = await fetchPage(url);
    const form = parseRecentForm(html);
    const standings = parseStandings(html);
    return { form, standings };
  } catch (e) {
    logger.error(`采集球队${teamId}分析失败: ${e.message}`);
    return null;
  }
}

/**
 * 从比赛列表页提取球队链接ID
 */
function extractTeamIds(html) {
  const ids = {};
  // 匹配 liansai.500.com/team/ID/ 格式的链接
  const pattern = /liansai\.500\.com\/team\/(\d+)\/[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    ids[m[2]] = m[1];
  }
  return ids;
}

/**
 * 基于赔率生成比赛分析
 */
function generateOddsAnalysis(match) {
  const analysis = {};

  // 胜平负隐含概率
  const spHome = parseFloat(match.sp_home) || 0;
  const spDraw = parseFloat(match.sp_draw) || 0;
  const spAway = parseFloat(match.sp_away) || 0;

  if (spHome > 0 && spDraw > 0 && spAway > 0) {
    const margin = 1/spHome + 1/spDraw + 1/spAway;
    analysis.impliedProb = {
      home: ((1/spHome/margin) * 100).toFixed(1),
      draw: ((1/spDraw/margin) * 100).toFixed(1),
      away: ((1/spAway/margin) * 100).toFixed(1),
    };

    // 泊松模型估算期望进球
    const totalProb = 1/margin;
    const homeStr = 1/spHome/margin;
    const awayStr = 1/spAway/margin;
    // 基于赔率推算期望进球
    const avgGoals = 2.6;
    const homeXG = Math.max(0.5, Math.min(3.5, homeStr * avgGoals * 1.1));
    const awayXG = Math.max(0.3, Math.min(3.0, awayStr * avgGoals * 0.9));
    analysis.expectedGoals = {
      home: homeXG.toFixed(2),
      away: awayXG.toFixed(2),
      total: (homeXG + awayXG).toFixed(2),
    };

    // 比分概率矩阵（泊松分布）
    analysis.scoreProbs = {};
    const poisson = (k, lambda) => Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        const prob = poisson(h, homeXG) * poisson(a, awayXG);
        if (prob > 0.02) {
          analysis.scoreProbs[`${h}:${a}`] = (prob * 100).toFixed(1);
        }
      }
    }

    // 进球数概率
    analysis.goalsProbs = {};
    for (let g = 0; g <= 7; g++) {
      let prob = 0;
      for (let h = 0; h <= g; h++) {
        prob += poisson(h, homeXG) * poisson(g - h, awayXG);
      }
      if (g === 7) {
        // 7+球
        let sum7plus = 0;
        for (let h = 0; h <= 10; h++) {
          for (let a = 0; a <= 10; a++) {
            if (h + a >= 7) sum7plus += poisson(h, homeXG) * poisson(a, awayXG);
          }
        }
        prob = sum7plus;
      }
      if (prob > 0.01) {
        analysis.goalsProbs[g === 7 ? '7+' : String(g)] = (prob * 100).toFixed(1);
      }
    }

    // 强弱判断
    const homeProb = 1/spHome/margin;
    const awayProb = 1/spAway/margin;
    if (homeProb > 0.55) analysis.prediction = '主队优势明显';
    else if (homeProb > 0.45) analysis.prediction = '主队略占优势';
    else if (awayProb > 0.55) analysis.prediction = '客队优势明显';
    else if (awayProb > 0.45) analysis.prediction = '客队略占优势';
    else analysis.prediction = '双方势均力敌';

    // 大小球分析
    const totalXG = homeXG + awayXG;
    if (totalXG > 3.0) analysis.totalGoals = '大球概率较高';
    else if (totalXG > 2.3) analysis.totalGoals = '进球数适中';
    else analysis.totalGoals = '小球概率较高';
  }

  // 让球分析
  const handicap = parseInt(match.handicap) || 0;
  if (handicap !== 0 && spHome > 0) {
    const spHHome = parseFloat(match.sp_handicap_home) || 0;
    const spHDraw = parseFloat(match.sp_handicap_draw) || 0;
    const spHAway = parseFloat(match.sp_handicap_away) || 0;
    if (spHHome > 0 && spHAway > 0) {
      const hMargin = 1/spHHome + (spHDraw > 0 ? 1/spHDraw : 0) + 1/spHAway;
      analysis.handicapProb = {
        home: ((1/spHHome/hMargin) * 100).toFixed(1),
        draw: spHDraw > 0 ? ((1/spHDraw/hMargin) * 100).toFixed(1) : '0',
        away: ((1/spHAway/hMargin) * 100).toFixed(1),
      };
      const hStr = handicap > 0 ? `+${handicap}` : String(handicap);
      if (1/spHHome/hMargin > 0.5) analysis.handicapPrediction = `让${hStr} 主队可胜`;
      else if (1/spHAway/hMargin > 0.5) analysis.handicapPrediction = `让${hStr} 客队可胜`;
      else analysis.handicapPrediction = `让${hStr} 胜负难料`;
    }
  }

  return analysis;
}

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/**
 * 采集所有比赛的球队分析数据
 */
async function fetchAllTeamAnalysis(db) {
  logger.info('=== 采集球队分析数据 ===');

  // 从比赛列表页获取球队ID映射
  let teamIds = {};
  try {
    const html = await fetchPage('https://trade.500.com/jczq/?playid=269&g=2');
    teamIds = extractTeamIds(html);
    logger.info(`从500.com提取到${Object.keys(teamIds).length}个球队ID`);
  } catch (e) {
    logger.error(`提取球队ID失败: ${e.message}`);
  }

  // 获取今天有比赛的球队（包含最新赔率）
  const matches = db.prepare(`
    SELECT m.*, o.sp_home, o.sp_draw, o.sp_away,
           o.sp_handicap_home, o.sp_handicap_draw, o.sp_handicap_away
    FROM matches m
    LEFT JOIN (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY snapshot_time DESC) as rn
      FROM odds_snapshots
    ) o ON m.match_id = o.match_id AND o.rn = 1
    ORDER BY m.match_date
  `).all();
  const teamsNeeded = new Set();
  for (const m of matches) {
    teamsNeeded.add(m.home_team);
    teamsNeeded.add(m.away_team);
  }

  // 采集每支球队的数据
  const teamData = {};
  for (const team of teamsNeeded) {
    const teamId = teamIds[team];
    if (!teamId) {
      logger.warn(`未找到球队ID: ${team}`);
      continue;
    }

    try {
      const data = await fetchTeamAnalysis(teamId);
      if (data) {
        teamData[team] = data;
        logger.info(`  ${team}(${teamId}): ${data.form.summary || '无近期战绩'}`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      logger.error(`采集${team}失败: ${e.message}`);
    }
  }

  // 为每场比赛生成分析并保存
  for (const match of matches) {
    const oddsAnalysis = generateOddsAnalysis(match);
    const homeData = teamData[match.home_team] || {};
    const awayData = teamData[match.away_team] || {};

    const analysisData = {
      homeForm: homeData.form || null,
      awayForm: awayData.form || null,
      homeStandings: homeData.standings || null,
      awayStandings: awayData.standings || null,
      oddsAnalysis,
    };

    // 只更新分析数据，不覆盖已有的home_form_json/away_form_json（来自team_profiles.json）
    const existing = db.prepare('SELECT home_form_json, away_form_json FROM match_details WHERE match_id = ?').get(match.match_id);

    try {
      db.prepare(`
        INSERT INTO match_details (match_id, home_stats_json, away_stats_json, standings_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET
          home_stats_json = excluded.home_stats_json,
          away_stats_json = excluded.away_stats_json,
          standings_json = excluded.standings_json
      `).run(
        match.match_id,
        JSON.stringify(analysisData),
        null,
        null
      );
    } catch (e) {
      logger.error(`保存${match.match_id}分析失败: ${e.message}`);
    }
  }

  logger.info(`=== 球队分析采集完成: ${Object.keys(teamData).length}支球队 ===`);
  return teamData;
}

module.exports = { fetchAllTeamAnalysis, fetchTeamAnalysis, generateOddsAnalysis, extractTeamIds };
