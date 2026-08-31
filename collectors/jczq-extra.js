/**
 * 竞彩额外玩法采集：比分、总进球、半全场
 * 数据源：500.com 竞彩官方
 */
const https = require('https');
const iconv = require('iconv-lite');
const logger = require('./utils/logger');

const BASE_URL = 'https://trade.500.com/jczq/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

// playid 映射
const PLAY_IDS = {
  score: 271,    // 比分
  goals: 270,    // 总进球
  half: 272,     // 半全场
};

function fetchHTML(playid) {
  const url = `${BASE_URL}?playid=${playid}&g=2`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: HEADERS,
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const html = iconv.decode(Buffer.concat(chunks), 'gb2312');
        resolve(html);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * 解析比分赔率
 * 格式: "1:0 8.50 2:0 12.00 ..." 或 "胜其它 70.00"
 */
function parseScoreRow(rowText) {
  const scores = {};
  // 匹配 "数字:数字 赔率" 或 "X其它 赔率"
  const pattern = /(\d+:\d+|胜其它|平其它|负其它)\s+([\d.]+)/g;
  let m;
  while ((m = pattern.exec(rowText)) !== null) {
    scores[m[1]] = parseFloat(m[2]);
  }
  return scores;
}

/**
 * 解析总进球赔率
 * 格式: data-value="0" data-sp="13.00" 等
 */
function parseGoalsRow(html) {
  const goals = {};
  const pattern = /data-value="(\d+)"[^>]*data-sp="([\d.]+)"/g;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    goals[m[1]] = parseFloat(m[2]);
  }
  return goals;
}

/**
 * 解析半全场赔率
 * 格式: data-value="3-3" data-sp="3.60" 等
 * 3=主胜, 1=平, 0=客胜
 */
function parseHalfRow(html) {
  const results = {};
  const pattern = /data-value="([310]-[310])"[^>]*data-sp="([\d.]+)"/g;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    results[m[1]] = parseFloat(m[2]);
  }
  return results;
}

function parseScoreHTML(html) {
  const matches = [];

  // 比分页面结构：每个比赛有多个TR
  // TR with data-matchnum: 比赛基本信息
  // 后续TR: 包含 data-type="bf" 的比分赔率（主胜/平局/客胜各一个TR）
  const allTrs = html.split('<tr');

  let currentMatchId = null;

  for (const tr of allTrs) {
    // 检查是否是比赛行
    const matchNumMatch = /data-matchnum="([^"]+)"/.exec(tr);
    if (matchNumMatch) {
      currentMatchId = matchNumMatch[1];
      continue;
    }

    // 如果当前有比赛，检查是否有比分数据
    if (currentMatchId && tr.includes('data-type="bf"')) {
      const scores = {};
      const bfPattern = /data-value="([^"]+)"[^>]*data-sp="([\d.]+)"/g;
      let m;
      while ((m = bfPattern.exec(tr)) !== null) {
        scores[m[1]] = parseFloat(m[2]);
      }

      if (Object.keys(scores).length > 0) {
        // 查找是否已有该比赛的记录
        const existing = matches.find(m => m.matchId === currentMatchId);
        if (existing) {
          Object.assign(existing.scores, scores);
        } else {
          matches.push({ matchId: currentMatchId, scores: { ...scores } });
        }
      }
    }

    // 遇到下一个比赛行时重置
    if (matchNumMatch && currentMatchId !== matchNumMatch[1]) {
      currentMatchId = matchNumMatch[1];
    }
  }

  return matches;
}

function parseGoalsHTML(html) {
  const matches = [];
  const rows = html.split('<tr').filter(r => r.includes('data-matchnum='));

  for (const row of rows) {
    const matchNumMatch = /data-matchnum="([^"]+)"/.exec(row);
    if (!matchNumMatch) continue;

    const goals = parseGoalsRow(row);
    if (Object.keys(goals).length > 0) {
      matches.push({ matchId: matchNumMatch[1], goals });
    }
  }

  return matches;
}

function parseHalfHTML(html) {
  const matches = [];
  const rows = html.split('<tr').filter(r => r.includes('data-matchnum='));

  for (const row of rows) {
    const matchNumMatch = /data-matchnum="([^"]+)"/.exec(row);
    if (!matchNumMatch) continue;

    const halfFull = parseHalfRow(row);
    if (Object.keys(halfFull).length > 0) {
      matches.push({ matchId: matchNumMatch[1], halfFull });
    }
  }

  return matches;
}

function saveExtraOdds(db, matchId, type, data) {
  // 存入 odds_snapshots 表的 JSON 字段
  const fieldMap = {
    score: 'score_odds_json',
    goals: 'goals_odds_json',
    half: 'half_odds_json',
  };

  const field = fieldMap[type];
  if (!field) return;

  // 检查字段是否存在，不存在则添加
  const columns = db.prepare("PRAGMA table_info(odds_snapshots)").all().map(c => c.name);
  if (!columns.includes(field)) {
    db.exec(`ALTER TABLE odds_snapshots ADD COLUMN ${field} TEXT`);
  }

  db.prepare(`
    UPDATE odds_snapshots SET ${field} = ?
    WHERE match_id = ? AND snapshot_time = (
      SELECT MAX(snapshot_time) FROM odds_snapshots WHERE match_id = ?
    )
  `).run(JSON.stringify(data), matchId, matchId);
}

async function fetchAndSaveExtra(db) {
  logger.info('=== 采集竞彩额外玩法赔率 ===');

  for (const [type, playid] of Object.entries(PLAY_IDS)) {
    try {
      logger.info(`采集 ${type} (playid=${playid})...`);
      const html = await fetchHTML(playid);

      let matches;
      if (type === 'score') {
        matches = parseScoreHTML(html);
      } else if (type === 'goals') {
        matches = parseGoalsHTML(html);
      } else {
        matches = parseHalfHTML(html);
      }

      logger.info(`  解析到 ${matches.length} 场 ${type} 数据`);

      for (const m of matches) {
        try {
          saveExtraOdds(db, m.matchId, type, m.scores || m.goals || m.halfFull);
        } catch (e) {
          logger.error(`  保存 ${m.matchId} ${type} 失败: ${e.message}`);
        }
      }
    } catch (e) {
      logger.error(`采集 ${type} 失败: ${e.message}`);
    }
  }

  logger.info('=== 额外玩法采集完成 ===');
}

module.exports = { fetchAndSaveExtra, parseScoreHTML, parseGoalsHTML, parseHalfHTML };
