const https = require('https');
const iconv = require('iconv-lite');
const logger = require('./utils/logger');

const SOURCE_URL = 'https://trade.500.com/jczq/';

function fetchHTML() {
  return new Promise((resolve, reject) => {
    const req = https.get(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
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

function parseMatchRows(html) {
  const matches = [];
  const rows = html.split('<tr');

  for (const row of rows) {
    if (!row.includes('data-matchnum=')) continue;
    const rowEnd = row.indexOf('</tr>');
    const rowHTML = rowEnd > 0 ? row.slice(0, rowEnd) : row;

    const getAttr = (name) => {
      const re = new RegExp('data-' + name + '="([^"]*)"', 'i');
      const m = re.exec(rowHTML);
      return m ? m[1] : '';
    };

    const matchNum = getAttr('matchnum');
    if (!matchNum) continue;

    const homeTeam = getAttr('homesxname');
    const awayTeam = getAttr('awaysxname');
    const league = getAttr('simpleleague');
    const matchDate = getAttr('matchdate');
    const matchTime = getAttr('matchtime');
    const buyEndTime = getAttr('buyendtime');
    const handicap = parseInt(getAttr('rangqiu')) || 0;

    // Extract SP values
    const sps = [];
    const spRe = /data-sp="([\d.]+)"/g;
    let spMatch;
    while ((spMatch = spRe.exec(rowHTML)) !== null) {
      sps.push(parseFloat(spMatch[1]));
    }

    // Full team names from title attributes
    const homeTitleMatch = /<a[^>]*class="team-l"[^>]*title="([^"]*)"/.exec(rowHTML);
    const awayTitleMatch = /<a[^>]*class="team-r"[^>]*title="([^"]*)"/.exec(rowHTML);
    const homeTitle = homeTitleMatch ? homeTitleMatch[1] : homeTeam;
    const awayTitle = awayTitleMatch ? awayTitleMatch[1] : awayTeam;

    // Rankings
    const ranks = [];
    const rankRe = /title="排名第(\d+)"/g;
    let rm;
    while ((rm = rankRe.exec(rowHTML)) !== null) ranks.push(parseInt(rm[1]));

    const deadline = buyEndTime || (matchDate + ' ' + matchTime);

    matches.push({
      matchId: matchNum,
      matchDate: matchDate,
      matchTime: matchTime,
      buyDeadline: deadline,
      leagueName: league || '未知联赛',
      homeTeam: homeTitle,
      awayTeam: awayTitle,
      homeRank: ranks[0] || null,
      awayRank: ranks[1] || null,
      handicap: handicap,
      odds: {
        spf: { home: sps[0] || null, draw: sps[1] || null, away: sps[2] || null },
        hhspf: { home: sps[3] || null, draw: sps[4] || null, away: sps[5] || null, handicap },
      },
    });
  }

  return matches;
}

function saveMatchesToDB(db, matches) {
  const upsertMatch = db.prepare(`
    INSERT INTO matches (match_id, match_date, match_time, buy_deadline, league_name,
      home_team, away_team, home_rank, away_rank, handicap, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(match_id) DO UPDATE SET
      match_date=excluded.match_date, match_time=excluded.match_time,
      buy_deadline=excluded.buy_deadline, league_name=excluded.league_name,
      home_team=excluded.home_team, away_team=excluded.away_team,
      home_rank=excluded.home_rank, away_rank=excluded.away_rank,
      handicap=excluded.handicap, updated_at=CURRENT_TIMESTAMP
  `);

  const insertOdds = db.prepare(`
    INSERT INTO odds_snapshots (match_id, sp_home, sp_draw, sp_away,
      sp_handicap_home, sp_handicap_draw, sp_handicap_away)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((matches) => {
    for (const m of matches) {
      upsertMatch.run(m.matchId, m.matchDate, m.matchTime, m.buyDeadline,
        m.leagueName, m.homeTeam, m.awayTeam, m.homeRank, m.awayRank, m.handicap);
      insertOdds.run(m.matchId,
        m.odds.spf.home, m.odds.spf.draw, m.odds.spf.away,
        m.odds.hhspf.home, m.odds.hhspf.draw, m.odds.hhspf.away);
    }
  });

  insertAll(matches);
  return matches.length;
}

async function fetchAndSaveMatches(db) {
  logger.info('开始采集 500.com 竞彩数据...');
  const html = await fetchHTML();
  const matches = parseMatchRows(html);
  logger.info(`解析到 ${matches.length} 场比赛`);

  if (matches.length > 0) {
    const saved = saveMatchesToDB(db, matches);
    logger.info(`保存 ${saved} 场比赛到数据库`);
  }

  return matches;
}

module.exports = { fetchAndSaveMatches, parseMatchRows, fetchHTML, saveMatchesToDB };
