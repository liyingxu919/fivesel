# 竞彩足球智能分析系统 - 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个专业级竞彩足球分析预测系统，每日自动输出以小搏大的串3/串4投注方案。

**Architecture:** Node.js 采集层抓取竞彩官方数据写入 SQLite，Python 分析引擎读取数据运行泊松/Elo/XGBoost 集成模型，输出概率与价值评估，生成串关推荐，Web 前端展示结果并追踪命中率。

**Tech Stack:** Node.js (采集+服务端), Python 3.11+ (分析引擎), SQLite (数据存储), HTML/CSS/JS + ECharts (前端), XGBoost/LightGBM (ML模型)

**Spec:** `docs/2026-08-28-jingcai-system-design.md`

## Global Constraints

- 只用中国竞彩官方赔率（500.com trade.500.com/jczq/）
- 只分析竞彩开售场次
- 每日投入 ≤ 20 元
- 所有推荐使用概率语言，不说"必中"
- 采集频率合理，不给源站造成压力（每次请求间隔 ≥ 1 秒）

---

## Phase 1: 数据基础

### Task 1: 项目初始化与数据库

**Files:**
- Create: `football-jingcai/collectors/package.json`
- Create: `football-jingcai/analyzer/requirements.txt`
- Create: `football-jingcai/data/` (directory)
- Create: `football-jingcai/collectors/utils/db.js`
- Create: `football-jingcai/scripts/init_db.js`
- Test: `football-jingcai/collectors/utils/__tests__/db.test.js`

**Interfaces:**
- Produces: `initDatabase(dbPath)` → 创建 SQLite 数据库和所有表
- Produces: `getDatabase(dbPath)` → 返回数据库连接

- [ ] **Step 1: 创建项目目录结构**

```bash
cd /Users/xujiuying/football-jingcai
mkdir -p collectors/utils/__tests__
mkdir -p collectors/utils
mkdir -p analyzer/features
mkdir -p analyzer/models
mkdir -p analyzer/value
mkdir -p analyzer/learning
mkdir -p analyzer/__tests__
mkdir -p server/routes
mkdir -p server/middleware
mkdir -p web/css
mkdir -p web/js
mkdir -p data/models
mkdir -p scripts
```

- [ ] **Step 2: 初始化 Node.js 项目**

```bash
cd /Users/xujiuying/football-jingcai/collectors
npm init -y
npm install better-sqlite3 axios iconv-lite node-cron winston
npm install --save-dev jest
```

Write `collectors/package.json`:
```json
{
  "name": "jingcai-collectors",
  "version": "1.0.0",
  "description": "竞彩足球数据采集模块",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest --verbose",
    "init-db": "node utils/init_db.js"
  },
  "dependencies": {
    "axios": "^1.7.0",
    "better-sqlite3": "^11.0.0",
    "iconv-lite": "^0.6.3",
    "node-cron": "^3.0.3",
    "winston": "^3.13.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 3: 初始化 Python 项目**

Write `analyzer/requirements.txt`:
```
numpy>=1.26.0
pandas>=2.2.0
scikit-learn>=1.5.0
xgboost>=2.0.0
lightgbm>=4.3.0
scipy>=1.13.0
matplotlib>=3.8.0
joblib>=1.4.0
```

```bash
cd /Users/xujiuying/football-jingcai/analyzer
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 4: 编写数据库初始化脚本**

Write `collectors/utils/db.js`:
```javascript
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '../../data/jingcai.db');

function getDatabase(dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initDatabase(dbPath = DEFAULT_DB_PATH) {
  const db = getDatabase(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      match_id TEXT PRIMARY KEY,
      match_date DATE,
      match_time TIME,
      buy_deadline DATETIME,
      league_name TEXT,
      home_team TEXT,
      away_team TEXT,
      home_rank INTEGER,
      away_rank INTEGER,
      handicap INTEGER DEFAULT 0,
      status TEXT DEFAULT 'notstarted',
      home_score INTEGER,
      away_score INTEGER,
      flashscore_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS odds_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(match_id),
      snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      sp_home REAL,
      sp_draw REAL,
      sp_away REAL,
      sp_handicap_home REAL,
      sp_handicap_draw REAL,
      sp_handicap_away REAL,
      sp_goals_0 REAL,
      sp_goals_1 REAL,
      sp_goals_2 REAL,
      sp_goals_3 REAL,
      sp_goals_4 REAL,
      sp_goals_5 REAL,
      sp_goals_6 REAL,
      sp_goals_7plus REAL,
      sp_scores_json TEXT
    );

    CREATE TABLE IF NOT EXISTS match_details (
      match_id TEXT PRIMARY KEY REFERENCES matches(match_id),
      home_form_json TEXT,
      away_form_json TEXT,
      h2h_json TEXT,
      home_stats_json TEXT,
      away_stats_json TEXT,
      standings_json TEXT,
      lineups_json TEXT,
      missing_players_json TEXT,
      weather TEXT,
      footballbin_prediction_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(match_id),
      model_version TEXT,
      prob_home REAL,
      prob_draw REAL,
      prob_away REAL,
      prob_handicap_home REAL,
      prob_handicap_draw REAL,
      prob_handicap_away REAL,
      prob_goals_json TEXT,
      prob_scores_json TEXT,
      value_spf_json TEXT,
      value_hhspf_json TEXT,
      value_goals_json TEXT,
      value_scores_json TEXT,
      confidence REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rec_date DATE,
      rec_type TEXT,
      matches_json TEXT,
      total_odds REAL,
      stake REAL,
      expected_value REAL,
      result TEXT DEFAULT 'pending',
      actual_payout REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS model_versions (
      version TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      features_json TEXT,
      hyperparams_json TEXT,
      accuracy REAL,
      log_loss REAL,
      roi REAL,
      brier_score REAL,
      is_active BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS learning_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      model_version TEXT,
      predicted_outcome TEXT,
      predicted_prob REAL,
      actual_outcome TEXT,
      was_correct BOOLEAN,
      odds_at_time REAL,
      profit_loss REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
    CREATE INDEX IF NOT EXISTS idx_recommendations_date ON recommendations(rec_date);
    CREATE INDEX IF NOT EXISTS idx_learning_match ON learning_log(match_id);
  `);

  return db;
}

module.exports = { getDatabase, initDatabase, DEFAULT_DB_PATH };
```

- [ ] **Step 5: 编写数据库测试**

Write `collectors/utils/__tests__/db.test.js`:
```javascript
const { initDatabase } = require('../db');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '../../data/test.db');

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

test('initDatabase creates all tables', () => {
  const db = initDatabase(TEST_DB_PATH);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);

  expect(tableNames).toContain('matches');
  expect(tableNames).toContain('odds_snapshots');
  expect(tableNames).toContain('match_details');
  expect(tableNames).toContain('predictions');
  expect(tableNames).toContain('recommendations');
  expect(tableNames).toContain('model_versions');
  expect(tableNames).toContain('learning_log');
  db.close();
});

test('initDatabase is idempotent', () => {
  const db1 = initDatabase(TEST_DB_PATH);
  db1.close();
  const db2 = initDatabase(TEST_DB_PATH);
  db2.close();
  // no error = pass
});
```

- [ ] **Step 6: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/collectors
npx jest --verbose
```
Expected: PASS

- [ ] **Step 7: 初始化数据库**

```bash
node utils/init_db.js
```
Expected: `data/jingcai.db` created with all tables

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: project init with SQLite schema and db utilities"
```

---

### Task 2: 500.com 竞彩数据采集

**Files:**
- Create: `football-jingcai/collectors/jczq-500.js`
- Create: `football-jingcai/collectors/utils/logger.js`
- Test: `football-jingcai/collectors/__tests__/jczq-500.test.js`

**Interfaces:**
- Consumes: `getDatabase(dbPath)` from Task 1
- Produces: `fetchAndSaveMatches(db)` → 抓取竞彩数据写入数据库，返回 match 数组
- Produces: `parseMatchRows(html)` → 解析 HTML 提取比赛数据（纯函数，可测试）

- [ ] **Step 1: 编写日志工具**

Write `collectors/utils/logger.js`:
```javascript
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../../data/collectors.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ]
});

module.exports = logger;
```

- [ ] **Step 2: 编写 500.com 采集模块**

Write `collectors/jczq-500.js`:
```javascript
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
```

- [ ] **Step 3: 编写测试**

Write `collectors/__tests__/jczq-500.test.js`:
```javascript
const { parseMatchRows } = require('../jczq-500');

test('parseMatchRows extracts match data from HTML', () => {
  const html = `
    <tr data-matchnum="周四001" data-homesxname="主队" data-awaysxname="客队"
        data-simpleleague="英超" data-matchdate="2026-08-28" data-matchtime="20:00"
        data-buyendtime="2026-08-28 19:45" data-rangqiu="-1">
      <td><a class="team-l" title="曼彻斯特城">主队</a></td>
      <td>VS</td>
      <td><a class="team-r" title="利物浦">客队</a></td>
      <td data-sp="1.55"></td>
      <td data-sp="3.80"></td>
      <td data-sp="4.50"></td>
      <td data-sp="2.80"></td>
      <td data-sp="3.20"></td>
      <td data-sp="2.10"></td>
      <td title="排名第1"></td>
      <td title="排名第3"></td>
    </tr>
  `;

  const matches = parseMatchRows(html);
  expect(matches).toHaveLength(1);
  expect(matches[0].matchId).toBe('周四001');
  expect(matches[0].homeTeam).toBe('曼彻斯特城');
  expect(matches[0].awayTeam).toBe('利物浦');
  expect(matches[0].leagueName).toBe('英超');
  expect(matches[0].handicap).toBe(-1);
  expect(matches[0].odds.spf.home).toBe(1.55);
  expect(matches[0].odds.spf.draw).toBe(3.80);
  expect(matches[0].odds.spf.away).toBe(4.50);
  expect(matches[0].homeRank).toBe(1);
  expect(matches[0].awayRank).toBe(3);
});

test('parseMatchRows handles empty HTML', () => {
  expect(parseMatchRows('')).toEqual([]);
  expect(parseMatchRows('<html><body>no matches</body></html>')).toEqual([]);
});
```

- [ ] **Step 4: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/collectors
npx jest __tests__/jczq-500.test.js --verbose
```
Expected: PASS

- [ ] **Step 5: 手动测试实际采集**

```bash
node -e "
const { getDatabase, initDatabase } = require('./utils/db');
const { fetchAndSaveMatches } = require('./jczq-500');
const db = initDatabase();
fetchAndSaveMatches(db).then(matches => {
  console.log('采集到:', matches.length, '场');
  matches.forEach(m => console.log(m.matchId, m.leagueName, m.homeTeam, 'vs', m.awayTeam, m.odds.spf));
  db.close();
}).catch(e => console.error(e));
"
```
Expected: 输出当日竞彩比赛列表

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 500.com 竞彩数据采集模块"
```

---

### Task 3: FlashScore 比赛数据采集

**Files:**
- Create: `football-jingcai/collectors/flashscore.js`
- Test: `football-jingcai/collectors/__tests__/flashscore.test.js`

**Interfaces:**
- Consumes: `getDatabase(dbPath)` from Task 1
- Produces: `fetchMatchDetails(db, matchId, homeTeam, awayTeam)` → 采集 FlashScore 数据写入 match_details 表
- Produces: `searchTeam(teamName)` → 搜索队伍返回 team_id

- [ ] **Step 1: 编写 FlashScore 采集模块**

Write `collectors/flashscore.js`:
```javascript
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

module.exports = { searchTeam, fetchMatchDetails, fetchTeamResults, fetchH2H, saveMatchDetails };
```

- [ ] **Step 2: 编写测试**

Write `collectors/__tests__/flashscore.test.js`:
```javascript
const { searchTeam } = require('../flashscore');

test('searchTeam returns results for known team', async () => {
  const results = await searchTeam('Manchester City');
  expect(Array.isArray(results)).toBe(true);
  if (results.length > 0) {
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('name');
  }
}, 15000);

test('searchTeam returns empty for gibberish', async () => {
  const results = await searchTeam('xyznonexistent123');
  expect(results).toEqual([]);
}, 15000);
```

- [ ] **Step 3: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/collectors
npx jest __tests__/flashscore.test.js --verbose
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: FlashScore 比赛数据采集模块"
```

---

### Task 4: 采集调度器

**Files:**
- Create: `football-jingcai/collectors/index.js`
- Create: `football-jingcai/scripts/daily.sh`

**Interfaces:**
- Consumes: `fetchAndSaveMatches(db)` from Task 2
- Consumes: `fetchMatchDetails(db, ...)` from Task 3
- Produces: 每日自动采集流程

- [ ] **Step 1: 编写调度器**

Write `collectors/index.js`:
```javascript
const cron = require('node-cron');
const { getDatabase, initDatabase } = require('./utils/db');
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
```

- [ ] **Step 2: 编写每日脚本**

Write `scripts/daily.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "=== 竞彩每日流程 ==="
echo "时间: $(date)"

# 1. 数据采集
echo "[1/3] 数据采集..."
cd collectors
node -e "
const { getDatabase, initDatabase } = require('./utils/db');
const { fetchAndSaveMatches } = require('./jczq-500');
const db = initDatabase();
fetchAndSaveMatches(db).then(m => {
  console.log('采集完成:', m.length, '场');
  db.close();
}).catch(e => { console.error(e); process.exit(1); });
"
cd ..

# 2. 运行分析引擎
echo "[2/3] 运行分析引擎..."
cd analyzer
source venv/bin/activate
python main.py --date today
deactivate
cd ..

# 3. 完成
echo "[3/3] 每日流程完成!"
echo "查看推荐: http://localhost:3000"
```

```bash
chmod +x scripts/daily.sh
```

- [ ] **Step 3: 手动测试采集流程**

```bash
cd /Users/xujiuying/football-jingcai/collectors
node index.js --now
```
Expected: 采集竞彩数据并输出结果

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: 采集调度器和每日脚本"
```

---

## Phase 2: 分析引擎

### Task 5: 泊松分布进球模型

**Files:**
- Create: `football-jingcai/analyzer/config.py`
- Create: `football-jingcai/analyzer/models/poisson.py`
- Create: `football-jingcai/analyzer/__tests__/test_poisson.py`

**Interfaces:**
- Produces: `PoissonModel.predict(home_attack, away_attack, home_defense, away_defense)` → dict with score_matrix, goals_probs, spf_probs

- [ ] **Step 1: 编写配置文件**

Write `analyzer/config.py`:
```python
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'jingcai.db')

# 泊松模型参数
POISSON_MAX_GOALS = 7  # 最大进球数（0-7+）
HOME_ADVANTAGE = 0.25  # 主场进攻加成系数

# Elo 参数
ELO_INITIAL = 1500
ELO_K = 32
ELO_HOME_ADVANTAGE = 100

# 价值评估
VALUE_THRESHOLD = 1.0     # 正期望阈值
VALUE_HIGH = 1.5          # 高价值阈值
VALUE_VERY_HIGH = 2.0     # 极高价值阈值

# 串关配置
DAILY_BUDGET = 20         # 每日投入上限（元）
COMBO3_COUNT = 2          # 串3组数
COMBO4_COUNT = 1          # 串4组数
SCORE_COMBO_COUNT = 1     # 比分串组数
STAKE_PER_COMBO = 2       # 每组投入（元）
```

- [ ] **Step 2: 编写泊松模型**

Write `analyzer/models/poisson.py`:
```python
"""泊松分布进球模型"""
import math
import numpy as np
from config import POISSON_MAX_GOALS, HOME_ADVANTAGE


def poisson_pmf(k, lam):
    """泊松概率质量函数"""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


class PoissonModel:
    """基于泊松分布的足球进球预测模型"""

    def __init__(self, max_goals=POISSON_MAX_GOALS, home_advantage=HOME_ADVANTAGE):
        self.max_goals = max_goals
        self.home_advantage = home_advantage

    def predict(self, home_attack, away_attack, home_defense, away_defense):
        """
        预测比赛结果概率分布

        参数:
            home_attack: 主队攻击力（场均进球）
            away_attack: 客队攻击力（场均进球）
            home_defense: 主队防守力（场均失球）
            away_defense: 客队防守力（场均失球）

        返回:
            dict: {
                'score_matrix': np.array,  # 比分概率矩阵 [home_goals][away_goals]
                'home_goals_lambda': float,
                'away_goals_lambda': float,
                'spf_probs': {'home': float, 'draw': float, 'away': float},
                'total_goals_probs': {0: float, 1: float, ..., '7+': float},
                'score_probs': {'0:0': float, '1:0': float, ...},
            }
        """
        # 计算期望进球数（lambda）
        # 主队进球 = 主队攻击力 × 客队防守弱点 × 主场加成
        home_lambda = home_attack * (away_defense / 1.0) * (1 + self.home_advantage)
        # 客队进球 = 客队攻击力 × 主队防守弱点
        away_lambda = away_attack * (home_defense / 1.0)

        # 确保 lambda 合理
        home_lambda = max(0.2, min(home_lambda, 5.0))
        away_lambda = max(0.2, min(away_lambda, 5.0))

        # 计算比分概率矩阵
        n = self.max_goals + 1
        score_matrix = np.zeros((n, n))

        for i in range(n):
            for j in range(n):
                p_home = poisson_pmf(i, home_lambda)
                p_away = poisson_pmf(j, away_lambda)
                score_matrix[i][j] = p_home * p_away

        # 归一化（处理 7+ 的截断误差）
        total = score_matrix.sum()
        if total > 0:
            score_matrix /= total

        # 胜平负概率
        home_win = np.sum(np.tril(score_matrix, -1))  # 主队进球 > 客队
        draw = np.sum(np.diag(score_matrix))
        away_win = np.sum(np.triu(score_matrix, 1))   # 客队进球 > 主队

        # 修正：tril 是下三角（i > j 即主队进球多），triu 是上三角（j > i）
        home_win = 0.0
        draw = 0.0
        away_win = 0.0
        for i in range(n):
            for j in range(n):
                if i > j:
                    home_win += score_matrix[i][j]
                elif i == j:
                    draw += score_matrix[i][j]
                else:
                    away_win += score_matrix[i][j]

        # 总进球数概率
        total_goals_probs = {}
        for goals in range(self.max_goals):
            prob = 0.0
            for i in range(n):
                for j in range(n):
                    if i + j == goals:
                        prob += score_matrix[i][j]
            total_goals_probs[goals] = prob
        # 7+
        prob_7plus = 0.0
        for i in range(n):
            for j in range(n):
                if i + j >= self.max_goals:
                    prob_7plus += score_matrix[i][j]
        total_goals_probs['7+'] = prob_7plus

        # 比分概率
        score_probs = {}
        for i in range(min(5, n)):
            for j in range(min(5, n)):
                key = f'{i}:{j}'
                score_probs[key] = float(score_matrix[i][j])

        return {
            'score_matrix': score_matrix,
            'home_goals_lambda': home_lambda,
            'away_goals_lambda': away_lambda,
            'spf_probs': {
                'home': float(home_win),
                'draw': float(draw),
                'away': float(away_win),
            },
            'total_goals_probs': total_goals_probs,
            'score_probs': score_probs,
        }
```

- [ ] **Step 3: 编写测试**

Write `analyzer/__tests__/test_poisson.py`:
```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.poisson import PoissonModel, poisson_pmf


def test_poisson_pmf():
    assert abs(poisson_pmf(0, 1.0) - 0.3679) < 0.001
    assert abs(poisson_pmf(1, 1.0) - 0.3679) < 0.001
    assert abs(poisson_pmf(2, 1.0) - 0.1839) < 0.001
    assert poisson_pmf(0, 0) == 1.0


def test_model_output_structure():
    model = PoissonModel()
    result = model.predict(1.5, 1.2, 1.0, 1.0)

    assert 'spf_probs' in result
    assert 'total_goals_probs' in result
    assert 'score_probs' in result
    assert 'score_matrix' in result

    spf = result['spf_probs']
    assert abs(spf['home'] + spf['draw'] + spf['away'] - 1.0) < 0.01


def test_strong_home_team():
    model = PoissonModel()
    result = model.predict(2.5, 0.8, 0.8, 1.5)

    spf = result['spf_probs']
    assert spf['home'] > spf['away'], "强主队应有更高胜率"
    assert spf['home'] > 0.4


def test_balanced_match():
    model = PoissonModel()
    result = model.predict(1.3, 1.3, 1.0, 1.0)

    spf = result['spf_probs']
    assert abs(spf['home'] - spf['away']) < 0.15, "实力相近比赛主客胜率应接近"
```

- [ ] **Step 4: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/analyzer
source venv/bin/activate
python -m pytest __tests__/test_poisson.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 泊松分布进球模型"
```

---

### Task 6: Elo 评分系统

**Files:**
- Create: `football-jingcai/analyzer/models/elo.py`
- Create: `football-jingcai/analyzer/__tests__/test_elo.py`

**Interfaces:**
- Produces: `EloSystem.get_or_create(team_name)` → float (Elo rating)
- Produces: `EloSystem.predict_match(home_team, away_team)` → dict with spf_probs
- Produces: `EloSystem.update(home_team, away_team, result)` → updates internal ratings

- [ ] **Step 1: 编写 Elo 系统**

Write `analyzer/models/elo.py`:
```python
"""Elo 评分系统"""
import math
from config import ELO_INITIAL, ELO_K, ELO_HOME_ADVANTAGE


class EloSystem:
    """足球 Elo 评分系统"""

    def __init__(self, initial=ELO_INITIAL, k=ELO_K, home_advantage=ELO_HOME_ADVANTAGE):
        self.ratings = {}
        self.initial = initial
        self.k = k
        self.home_advantage = home_advantage

    def get_or_create(self, team_name):
        if team_name not in self.ratings:
            self.ratings[team_name] = self.initial
        return self.ratings[team_name]

    def expected_score(self, rating_a, rating_b):
        return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))

    def predict_match(self, home_team, away_team):
        """
        预测比赛结果概率

        返回: {'home': float, 'draw': float, 'away': float}
        """
        home_elo = self.get_or_create(home_team) + self.home_advantage
        away_elo = self.get_or_create(away_team)

        expected_home = self.expected_score(home_elo, away_elo)

        # Elo 期望值是胜率，需要推导平局概率
        # 使用经验公式：draw_prob ≈ 0.25 + 0.1 × (1 - |expected_home - 0.5| × 2)
        draw_factor = 1.0 - abs(expected_home - 0.5) * 2
        draw_prob = 0.22 + 0.12 * draw_factor

        home_win_prob = expected_home * (1 - draw_prob)
        away_win_prob = (1 - expected_home) * (1 - draw_prob)

        # 归一化
        total = home_win_prob + draw_prob + away_win_prob
        return {
            'home': home_win_prob / total,
            'draw': draw_prob / total,
            'away': away_win_prob / total,
        }

    def update(self, home_team, away_team, result):
        """
        更新 Elo 评分

        参数:
            result: 'home' | 'draw' | 'away'
        """
        home_elo = self.get_or_create(home_team)
        away_elo = self.get_or_create(away_team)

        expected_home = self.expected_score(home_elo + self.home_advantage, away_elo)

        if result == 'home':
            actual_home = 1.0
        elif result == 'draw':
            actual_home = 0.5
        else:
            actual_home = 0.0

        self.ratings[home_team] = home_elo + self.k * (actual_home - expected_home)
        self.ratings[away_team] = away_elo + self.k * ((1 - actual_home) - (1 - expected_home))

    def load_ratings(self, ratings_dict):
        self.ratings = dict(ratings_dict)

    def export_ratings(self):
        return dict(self.ratings)
```

- [ ] **Step 2: 编写测试**

Write `analyzer/__tests__/test_elo.py`:
```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.elo import EloSystem


def test_initial_rating():
    elo = EloSystem()
    assert elo.get_or_create('Team A') == 1500


def test_stronger_team_higher_win_prob():
    elo = EloSystem()
    elo.ratings['Strong'] = 1800
    elo.ratings['Weak'] = 1200

    pred = elo.predict_match('Strong', 'Weak')
    assert pred['home'] > pred['away']


def test_elo_update():
    elo = EloSystem()
    elo.get_or_create('Home')
    elo.get_or_create('Away')

    elo.update('Home', 'Away', 'home')
    assert elo.ratings['Home'] > 1500
    assert elo.ratings['Away'] < 1500


def test_draw_updates():
    elo = EloSystem()
    elo.ratings['A'] = 1600
    elo.ratings['B'] = 1400

    elo.update('A', 'B', 'draw')
    # A was stronger, so draw should lower A and raise B
    assert elo.ratings['A'] < 1600
    assert elo.ratings['B'] > 1400


def test_home_advantage():
    elo = EloSystem()
    # Same rating, home team should have edge
    pred = elo.predict_match('Home', 'Away')
    assert pred['home'] > pred['away']
```

- [ ] **Step 3: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/analyzer
source venv/bin/activate
python -m pytest __tests__/test_elo.py -v
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Elo 评分系统"
```

---

### Task 7: 价值评估与 Kelly 公式

**Files:**
- Create: `football-jingcai/analyzer/value/evaluator.py`
- Create: `football-jingcai/analyzer/value/kelly.py`
- Create: `football-jingcai/analyzer/__tests__/test_value.py`

**Interfaces:**
- Produces: `evaluate_value(model_prob, odds_sp)` → float (value score)
- Produces: `kelly_fraction(model_prob, odds_sp)` → float (optimal bet fraction)
- Produces: `find_value_bets(predictions, odds)` → list of value bet dicts

- [ ] **Step 1: 编写价值评估**

Write `analyzer/value/evaluator.py`:
```python
"""价值评估系统"""
from config import VALUE_THRESHOLD, VALUE_HIGH, VALUE_VERY_HIGH


def implied_prob(sp):
    """从竞彩 SP 赔率反推隐含概率"""
    if sp is None or sp <= 1.0:
        return 0.0
    return 1.0 / sp


def evaluate_value(model_prob, odds_sp):
    """
    计算价值得分

    价值得分 = 模型概率 / 赔率隐含概率
    > 1.0 = 正期望
    > 1.5 = 高价值
    > 2.0 = 极高价值
    """
    imp = implied_prob(odds_sp)
    if imp <= 0:
        return 0.0
    return model_prob / imp


def value_level(score):
    """价值等级"""
    if score >= VALUE_VERY_HIGH:
        return '极高'
    elif score >= VALUE_HIGH:
        return '高'
    elif score >= VALUE_THRESHOLD:
        return '正期望'
    else:
        return '无价值'


def find_value_bets(predictions, odds, min_value=VALUE_THRESHOLD):
    """
    从预测结果和赔率中找出价值投注

    参数:
        predictions: dict, 如 {'home': 0.45, 'draw': 0.30, 'away': 0.25}
        odds: dict, 如 {'home': 2.10, 'draw': 3.50, 'away': 4.80}
        min_value: 最低价值得分阈值

    返回:
        list of dict: [{'outcome': str, 'model_prob': float, 'odds': float,
                        'implied_prob': float, 'value_score': float, 'level': str}]
    """
    bets = []
    for outcome in predictions:
        if outcome not in odds:
            continue
        model_prob = predictions[outcome]
        sp = odds[outcome]
        if sp is None or sp <= 1.0:
            continue

        imp = implied_prob(sp)
        vs = evaluate_value(model_prob, sp)

        if vs >= min_value:
            bets.append({
                'outcome': outcome,
                'model_prob': model_prob,
                'odds': sp,
                'implied_prob': imp,
                'value_score': vs,
                'level': value_level(vs),
            })

    bets.sort(key=lambda x: x['value_score'], reverse=True)
    return bets
```

- [ ] **Step 2: 编写 Kelly 公式**

Write `analyzer/value/kelly.py`:
```python
"""Kelly 公式计算最优投注比例"""


def kelly_fraction(model_prob, odds_sp):
    """
    计算 Kelly 公式最优投注比例

    f* = (bp - q) / b
    b = odds - 1 (净收益)
    p = model probability
    q = 1 - p

    返回半 Kelly 以降低波动
    """
    if odds_sp <= 1.0 or model_prob <= 0 or model_prob >= 1:
        return 0.0

    b = odds_sp - 1.0
    p = model_prob
    q = 1.0 - p

    full_kelly = (b * p - q) / b
    if full_kelly <= 0:
        return 0.0

    # 使用半 Kelly 降低波动
    return full_kelly / 2.0


def calculate_stake(kelly_frac, budget, min_stake=2.0, max_stake=None):
    """
    根据 Kelly 比例计算实际投注金额

    参数:
        kelly_frac: Kelly 比例
        budget: 可用预算
        min_stake: 最低投注额
        max_stake: 最高投注额（默认为预算的 50%）
    """
    if max_stake is None:
        max_stake = budget * 0.5

    raw = budget * kelly_frac
    return max(min_stake, min(raw, max_stake))
```

- [ ] **Step 3: 编写测试**

Write `analyzer/__tests__/test_value.py`:
```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from value.evaluator import evaluate_value, find_value_bets, implied_prob, value_level
from value.kelly import kelly_fraction, calculate_stake


def test_implied_prob():
    assert abs(implied_prob(2.0) - 0.5) < 0.001
    assert abs(implied_prob(4.0) - 0.25) < 0.001
    assert implied_prob(1.0) == 0.0
    assert implied_prob(0) == 0.0


def test_evaluate_value():
    # 模型 35%，赔率 5.0（隐含 20%），价值 = 1.75
    assert abs(evaluate_value(0.35, 5.0) - 1.75) < 0.01
    # 模型 50%，赔率 2.0（隐含 50%），价值 = 1.0
    assert abs(evaluate_value(0.50, 2.0) - 1.0) < 0.01
    # 模型 10%，赔率 3.0（隐含 33%），价值 = 0.3
    assert abs(evaluate_value(0.10, 3.0) - 0.3) < 0.01


def test_value_levels():
    assert value_level(2.5) == '极高'
    assert value_level(1.6) == '高'
    assert value_level(1.1) == '正期望'
    assert value_level(0.8) == '无价值'


def test_find_value_bets():
    preds = {'home': 0.45, 'draw': 0.30, 'away': 0.25}
    odds = {'home': 2.10, 'draw': 3.50, 'away': 4.80}

    bets = find_value_bets(preds, odds, min_value=1.0)
    assert len(bets) > 0
    assert all(b['value_score'] >= 1.0 for b in bets)
    assert bets == sorted(bets, key=lambda x: x['value_score'], reverse=True)


def test_kelly_basic():
    # SP=5.0, prob=35% → f* = (4*0.35 - 0.65)/4 = 0.1875, half = 0.09375
    frac = kelly_fraction(0.35, 5.0)
    assert abs(frac - 0.09375) < 0.001


def test_kelly_negative():
    # SP=2.0, prob=30% → negative edge
    frac = kelly_fraction(0.30, 2.0)
    assert frac == 0.0


def test_calculate_stake():
    assert calculate_stake(0.1, 20) == 2.0  # min stake
    assert calculate_stake(0.5, 20) == 10.0  # 50% of budget
```

- [ ] **Step 4: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/analyzer
source venv/bin/activate
python -m pytest __tests__/test_value.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 价值评估与 Kelly 公式"
```

---

### Task 8: 特征工程

**Files:**
- Create: `football-jingcai/analyzer/features/base.py`
- Create: `football-jingcai/analyzer/features/team_strength.py`
- Create: `football-jingcai/analyzer/features/odds_features.py`
- Create: `football-jingcai/analyzer/__tests__/test_features.py`

**Interfaces:**
- Produces: `extract_features(db, match_id)` → dict of all features for a match

- [ ] **Step 1: 编写特征基类**

Write `analyzer/features/base.py`:
```python
"""特征工程基类"""
import json
import sqlite3
from config import DB_PATH


def get_db(db_path=None):
    if db_path is None:
        db_path = DB_PATH
    return sqlite3.connect(db_path)


def load_match_data(db, match_id):
    """加载单场比赛的所有数据"""
    cursor = db.cursor()

    cursor.execute('SELECT * FROM matches WHERE match_id = ?', (match_id,))
    match = cursor.fetchone()
    if not match:
        return None

    columns = [d[0] for d in cursor.description]
    match_dict = dict(zip(columns, match))

    # 加载最新赔率
    cursor.execute('''
        SELECT * FROM odds_snapshots WHERE match_id = ?
        ORDER BY snapshot_time DESC LIMIT 1
    ''', (match_id,))
    odds = cursor.fetchone()
    if odds:
        odds_cols = [d[0] for d in cursor.description]
        match_dict['odds'] = dict(zip(odds_cols, odds))
    else:
        match_dict['odds'] = {}

    # 加载详细数据
    cursor.execute('SELECT * FROM match_details WHERE match_id = ?', (match_id,))
    details = cursor.fetchone()
    if details:
        detail_cols = [d[0] for d in cursor.description]
        match_dict['details'] = dict(zip(detail_cols, details))
    else:
        match_dict['details'] = {}

    return match_dict


def parse_json_field(value):
    """安全解析 JSON 字段"""
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None
```

- [ ] **Step 2: 编写基础实力特征**

Write `analyzer/features/team_strength.py`:
```python
"""基础实力特征提取"""
from features.base import parse_json_field


def extract_team_strength_features(match_dict):
    """
    提取基础实力特征

    返回 dict:
        home_rank, away_rank,
        rank_diff,
        home_form_wins, home_form_draws, home_form_losses (近 10 场),
        away_form_wins, away_form_draws, away_form_losses,
        home_goals_avg, home_conceded_avg,
        away_goals_avg, away_conceded_avg,
    """
    features = {}

    # 排名
    features['home_rank'] = match_dict.get('home_rank') or 99
    features['away_rank'] = match_dict.get('away_rank') or 99
    features['rank_diff'] = features['away_rank'] - features['home_rank']

    # 从 details 提取战绩
    details = match_dict.get('details', {})
    home_form = parse_json_field(details.get('home_form_json'))
    away_form = parse_json_field(details.get('away_form_json'))

    if home_form and isinstance(home_form, list):
        recent = home_form[:10]
        features['home_form_wins'] = sum(1 for m in recent if m.get('result') == 'W')
        features['home_form_draws'] = sum(1 for m in recent if m.get('result') == 'D')
        features['home_form_losses'] = sum(1 for m in recent if m.get('result') == 'L')
        goals = [m.get('goals_for', 0) for m in recent]
        conceded = [m.get('goals_against', 0) for m in recent]
        features['home_goals_avg'] = sum(goals) / max(len(goals), 1)
        features['home_conceded_avg'] = sum(conceded) / max(len(conceded), 1)
    else:
        features['home_form_wins'] = 0
        features['home_form_draws'] = 0
        features['home_form_losses'] = 0
        features['home_goals_avg'] = 1.3  # 联赛平均
        features['home_conceded_avg'] = 1.3

    if away_form and isinstance(away_form, list):
        recent = away_form[:10]
        features['away_form_wins'] = sum(1 for m in recent if m.get('result') == 'W')
        features['away_form_draws'] = sum(1 for m in recent if m.get('result') == 'D')
        features['away_form_losses'] = sum(1 for m in recent if m.get('result') == 'L')
        goals = [m.get('goals_for', 0) for m in recent]
        conceded = [m.get('goals_against', 0) for m in recent]
        features['away_goals_avg'] = sum(goals) / max(len(goals), 1)
        features['away_conceded_avg'] = sum(conceded) / max(len(conceded), 1)
    else:
        features['away_form_wins'] = 0
        features['away_form_draws'] = 0
        features['away_form_losses'] = 0
        features['away_goals_avg'] = 1.1  # 客场略低
        features['away_conceded_avg'] = 1.4

    return features
```

- [ ] **Step 3: 编写赔率特征**

Write `analyzer/features/odds_features.py`:
```python
"""赔率特征提取"""
from value.evaluator import implied_prob, evaluate_value


def extract_odds_features(match_dict):
    """
    提取赔率相关特征

    返回 dict:
        sp_home, sp_draw, sp_away,
        implied_home, implied_draw, implied_away,
        sp_handicap_home, sp_handicap_draw, sp_handicap_away,
        odds_margin,  # 抽水率
        cold_index,   # 冷门指数
    """
    features = {}
    odds = match_dict.get('odds', {})

    # 胜平负 SP
    features['sp_home'] = odds.get('sp_home') or 0
    features['sp_draw'] = odds.get('sp_draw') or 0
    features['sp_away'] = odds.get('sp_away') or 0

    # 隐含概率
    features['implied_home'] = implied_prob(features['sp_home'])
    features['implied_draw'] = implied_prob(features['sp_draw'])
    features['implied_away'] = implied_prob(features['sp_away'])

    # 让球胜平负
    features['sp_handicap_home'] = odds.get('sp_handicap_home') or 0
    features['sp_handicap_draw'] = odds.get('sp_handicap_draw') or 0
    features['sp_handicap_away'] = odds.get('sp_handicap_away') or 0

    # 抽水率（隐含概率总和 - 1）
    total_implied = features['implied_home'] + features['implied_draw'] + features['implied_away']
    features['odds_margin'] = total_implied - 1.0 if total_implied > 0 else 0

    # 冷门指数：最高赔率 / 最低赔率
    sps = [s for s in [features['sp_home'], features['sp_draw'], features['sp_away']] if s > 0]
    if sps:
        features['cold_index'] = max(sps) / min(sps)
    else:
        features['cold_index'] = 1.0

    return features
```

- [ ] **Step 4: 编写测试**

Write `analyzer/__tests__/test_features.py`:
```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from features.team_strength import extract_team_strength_features
from features.odds_features import extract_odds_features


def test_team_strength_defaults():
    match = {
        'home_rank': 5, 'away_rank': 12,
        'details': {}
    }
    f = extract_team_strength_features(match)
    assert f['rank_diff'] == 7
    assert f['home_goals_avg'] == 1.3  # default


def test_odds_features():
    match = {
        'odds': {
            'sp_home': 1.80, 'sp_draw': 3.50, 'sp_away': 4.50,
            'sp_handicap_home': 2.50, 'sp_handicap_draw': 3.20, 'sp_handicap_away': 2.60,
        }
    }
    f = extract_odds_features(match)
    assert f['sp_home'] == 1.80
    assert 0 < f['implied_home'] < 1
    assert f['odds_margin'] > 0  # 竞彩有抽水
    assert f['cold_index'] > 1.0
```

- [ ] **Step 5: 运行测试**

```bash
cd /Users/xujiuying/football-jingcai/analyzer
source venv/bin/activate
python -m pytest __tests__/test_features.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 特征工程（基础实力+赔率特征）"
```

---

### Task 9: 集成模型与分析主入口

**Files:**
- Create: `football-jingcai/analyzer/models/ensemble.py`
- Create: `football-jingcai/analyzer/main.py`
- Create: `football-jingcai/analyzer/value/combiner.py`

**Interfaces:**
- Produces: `EnsembleModel.predict(features)` → dict with probs for all play types
- Produces: `generate_combos(value_bets, budget)` → list of recommendation dicts
- Produces: `main.py --date today` → 运行完整分析流程

- [ ] **Step 1: 编写集成模型**

Write `analyzer/models/ensemble.py`:
```python
"""集成预测模型"""
import json
import sqlite3
from models.poisson import PoissonModel
from models.elo import EloSystem
from value.evaluator import find_value_bets
from features.team_strength import extract_team_strength_features
from features.odds_features import extract_odds_features
from config import DB_PATH


class EnsembleModel:
    """集成泊松 + Elo 的预测模型"""

    def __init__(self, poisson_weight=0.6, elo_weight=0.4):
        self.poisson = PoissonModel()
        self.elo = EloSystem()
        self.poisson_weight = poisson_weight
        self.elo_weight = elo_weight

    def predict(self, features):
        """
        综合预测

        参数:
            features: dict, 包含 team_strength + odds_features

        返回:
            dict: {
                'spf_probs': {'home': float, 'draw': float, 'away': float},
                'hhspf_probs': {...},
                'total_goals_probs': {...},
                'score_probs': {...},
            }
        """
        # 泊松模型
        poisson_result = self.poisson.predict(
            home_attack=features.get('home_goals_avg', 1.3),
            away_attack=features.get('away_goals_avg', 1.1),
            home_defense=features.get('home_conceded_avg', 1.3),
            away_defense=features.get('away_conceded_avg', 1.4),
        )

        # Elo 模型
        home_team = features.get('home_team', 'Home')
        away_team = features.get('away_team', 'Away')
        elo_probs = self.elo.predict_match(home_team, away_team)

        # 集成
        spf_probs = {
            'home': self.poisson_weight * poisson_result['spf_probs']['home'] +
                    self.elo_weight * elo_probs['home'],
            'draw': self.poisson_weight * poisson_result['spf_probs']['draw'] +
                    self.elo_weight * elo_probs['draw'],
            'away': self.poisson_weight * poisson_result['spf_probs']['away'] +
                    self.elo_weight * elo_probs['away'],
        }

        # 归一化
        total = sum(spf_probs.values())
        spf_probs = {k: v / total for k, v in spf_probs.items()}

        return {
            'spf_probs': spf_probs,
            'total_goals_probs': poisson_result['total_goals_probs'],
            'score_probs': poisson_result['score_probs'],
            'poisson_raw': poisson_result,
        }
```

- [ ] **Step 2: 编写串关组合生成**

Write `analyzer/value/combiner.py`:
```python
"""串关组合生成器"""
import itertools
from config import DAILY_BUDGET, COMBO3_COUNT, COMBO4_COUNT, SCORE_COMBO_COUNT, STAKE_PER_COMBO


def generate_combos(all_value_bets, score_value_bets=None, budget=DAILY_BUDGET):
    """
    生成每日投注方案

    参数:
        all_value_bets: 所有玩法的价值投注列表
        score_value_bets: 比分玩法的价值投注列表
        budget: 每日预算

    返回:
        dict: {
            'main': [{'type': '串3', 'bets': [...], 'total_odds': float, 'stake': float}],
            'backup': [{'type': '串4', 'bets': [...], 'total_odds': float, 'stake': float}],
            'score': [{'type': '比分串', 'bets': [...], 'total_odds': float, 'stake': float}],
            'total_stake': float,
        }
    """
    result = {'main': [], 'backup': [], 'score': [], 'total_stake': 0}

    # 按价值得分排序
    sorted_bets = sorted(all_value_bets, key=lambda x: x['value_score'], reverse=True)

    # 筛选赔率 > 2.0 的（博冷）
    cold_bets = [b for b in sorted_bets if b['odds'] >= 2.0]

    # 生成串3（主力方案）
    if len(cold_bets) >= 3:
        used_combos = set()
        for combo in itertools.combinations(cold_bets[:8], 3):
            # 避免同一联赛选太多
            leagues = set(b.get('league', '') for b in combo)
            if len(leagues) < 2:
                continue

            combo_key = tuple(sorted(b['match_id'] for b in combo))
            if combo_key in used_combos:
                continue
            used_combos.add(combo_key)

            total_odds = 1.0
            for b in combo:
                total_odds *= b['odds']

            ev = 1.0
            for b in combo:
                ev *= b['model_prob']

            result['main'].append({
                'type': '串3',
                'bets': list(combo),
                'total_odds': round(total_odds, 2),
                'expected_value': round(ev * total_odds, 2),
                'stake': STAKE_PER_COMBO,
            })

            if len(result['main']) >= COMBO3_COUNT:
                break

    # 生成串4（辅助方案）
    if len(cold_bets) >= 4:
        used_combos = set()
        for combo in itertools.combinations(cold_bets[:10], 4):
            leagues = set(b.get('league', '') for b in combo)
            if len(leagues) < 2:
                continue

            combo_key = tuple(sorted(b['match_id'] for b in combo))
            if combo_key in used_combos:
                continue
            used_combos.add(combo_key)

            total_odds = 1.0
            for b in combo:
                total_odds *= b['odds']

            result['backup'].append({
                'type': '串4',
                'bets': list(combo),
                'total_odds': round(total_odds, 2),
                'stake': STAKE_PER_COMBO,
            })

            if len(result['backup']) >= COMBO4_COUNT:
                break

    # 比分串
    if score_value_bets and len(score_value_bets) >= 2:
        sorted_scores = sorted(score_value_bets, key=lambda x: x['value_score'], reverse=True)
        combo = sorted_scores[:3]
        total_odds = 1.0
        for b in combo:
            total_odds *= b['odds']

        result['score'].append({
            'type': '比分串',
            'bets': combo,
            'total_odds': round(total_odds, 2),
            'stake': STAKE_PER_COMBO,
        })

    # 计算总投入
    result['total_stake'] = (
        len(result['main']) * STAKE_PER_COMBO +
        len(result['backup']) * STAKE_PER_COMBO +
        len(result['score']) * STAKE_PER_COMBO
    )

    return result
```

- [ ] **Step 3: 编写分析主入口**

Write `analyzer/main.py`:
```python
#!/usr/bin/env python3
"""竞彩分析主入口"""
import sys
import os
import json
import sqlite3
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from config import DB_PATH
from models.ensemble import EnsembleModel
from features.team_strength import extract_team_strength_features
from features.odds_features import extract_odds_features
from features.base import load_match_data, get_db
from value.evaluator import find_value_bets
from value.combiner import generate_combos


def analyze_match(model, db, match_id):
    """分析单场比赛"""
    match = load_match_data(db, match_id)
    if not match:
        return None

    features = {}
    features.update(extract_team_strength_features(match))
    features.update(extract_odds_features(match))
    features['home_team'] = match.get('home_team', '')
    features['away_team'] = match.get('away_team', '')

    prediction = model.predict(features)

    # 找价值投注
    spf_odds = {
        'home': features['sp_home'],
        'draw': features['sp_draw'],
        'away': features['sp_away'],
    }
    spf_values = find_value_bets(prediction['spf_probs'], spf_odds)

    # 总进球价值
    goals_values = []
    for goals, prob in prediction['total_goals_probs'].items():
        # 需要总进球赔率，暂跳过
        pass

    # 比分价值
    score_values = []
    for score, prob in prediction['score_probs'].items():
        if prob > 0.03:  # 概率 > 3% 的比分
            score_values.append({
                'match_id': match_id,
                'outcome': score,
                'model_prob': prob,
                'league': match.get('league_name', ''),
                'home_team': match.get('home_team', ''),
                'away_team': match.get('away_team', ''),
            })

    return {
        'match_id': match_id,
        'home_team': match.get('home_team'),
        'away_team': match.get('away_team'),
        'league': match.get('league_name'),
        'prediction': prediction,
        'spf_values': spf_values,
        'score_values': score_values,
    }


def save_prediction(db, match_id, analysis, model_version='v1'):
    """保存预测结果到数据库"""
    pred = analysis['prediction']
    db.execute('''
        INSERT INTO predictions (match_id, model_version,
            prob_home, prob_draw, prob_away,
            prob_goals_json, prob_scores_json,
            value_spf_json, value_scores_json, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        match_id, model_version,
        pred['spf_probs']['home'],
        pred['spf_probs']['draw'],
        pred['spf_probs']['away'],
        json.dumps(pred['total_goals_probs']),
        json.dumps(pred['score_probs']),
        json.dumps(analysis['spf_values']),
        json.dumps(analysis['score_values']),
        0.5,  # 默认置信度
    ))
    db.commit()


def save_recommendations(db, date_str, combos):
    """保存推荐方案到数据库"""
    for rec_type in ['main', 'backup', 'score']:
        for combo in combos.get(rec_type, []):
            db.execute('''
                INSERT INTO recommendations (rec_date, rec_type, matches_json,
                    total_odds, stake, expected_value)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                date_str, rec_type,
                json.dumps([{
                    'match_id': b.get('match_id'),
                    'outcome': b.get('outcome'),
                    'odds': b.get('odds'),
                    'value_score': b.get('value_score'),
                } for b in combo['bets']]),
                combo['total_odds'],
                combo['stake'],
                combo.get('expected_value', 0),
            ))
    db.commit()


def run_analysis(date_str=None):
    """运行完整分析流程"""
    if date_str is None or date_str == 'today':
        date_str = datetime.now().strftime('%Y-%m-%d')

    print(f'=== 竞彩分析 {date_str} ===')

    db = get_db()
    model = EnsembleModel()

    # 获取当日比赛
    cursor = db.execute(
        "SELECT match_id FROM matches WHERE match_date = ? AND status = 'notstarted'",
        (date_str,)
    )
    match_ids = [row[0] for row in cursor.fetchall()]

    if not match_ids:
        print('今日无竞彩比赛')
        return

    print(f'分析 {len(match_ids)} 场比赛...')

    all_spf_values = []
    all_score_values = []

    for match_id in match_ids:
        analysis = analyze_match(model, db, match_id)
        if analysis:
            save_prediction(db, match_id, analysis)
            for v in analysis['spf_values']:
                v['match_id'] = match_id
                v['league'] = analysis['league']
                v['home_team'] = analysis['home_team']
                v['away_team'] = analysis['away_team']
            all_spf_values.extend(analysis['spf_values'])
            all_score_values.extend(analysis['score_values'])

    # 生成串关方案
    combos = generate_combos(all_spf_values, all_score_values)
    save_recommendations(db, date_str, combos)

    # 输出结果
    print(f'\n=== 推荐方案 ===')
    print(f'总投入: {combos["total_stake"]} 元\n')

    for combo in combos['main']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b["odds"]} | 价值: {b["value_score"]:.2f}')
        print()

    for combo in combos['backup']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b["odds"]} | 价值: {b["value_score"]:.2f}')
        print()

    for combo in combos['score']:
        print(f'【{combo["type"]}】赔率: {combo["total_odds"]}x | 投入: {combo["stake"]}元')
        for b in combo['bets']:
            print(f'  {b.get("home_team", "")} vs {b.get("away_team", "")} | '
                  f'选: {b["outcome"]} @ {b.get("odds", "?")} | 概率: {b["model_prob"]:.1%}')
        print()

    db.close()
    print('分析完成!')


if __name__ == '__main__':
    date_arg = sys.argv[1] if len(sys.argv) > 1 else 'today'
    run_analysis(date_arg)
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: 集成模型、串关组合生成、分析主入口"
```

---

## Phase 3: Web 展示

### Task 10: Express API 服务

**Files:**
- Create: `football-jingcai/server/package.json`
- Create: `football-jingcai/server/app.js`
- Create: `football-jingcai/server/routes/matches.js`
- Create: `football-jingcai/server/routes/recommendations.js`

- [ ] **Step 1: 初始化服务端项目**

```bash
cd /Users/xujiuying/football-jingcai/server
npm init -y
npm install express better-sqlite3 cors
```

- [ ] **Step 2: 编写 API 服务**

Write `server/app.js`:
```javascript
const express = require('express');
const cors = require('cors');
const path = require('path');
const matchesRouter = require('./routes/matches');
const recommendationsRouter = require('./routes/recommendations');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

app.use('/api/matches', matchesRouter);
app.use('/api/recommendations', recommendationsRouter);

app.listen(PORT, () => {
  console.log(`竞彩分析服务已启动: http://localhost:${PORT}`);
});

module.exports = app;
```

Write `server/routes/matches.js`:
```javascript
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/jingcai.db');

router.get('/', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const matches = db.prepare(`
      SELECT m.*, o.sp_home, o.sp_draw, o.sp_away,
             o.sp_handicap_home, o.sp_handicap_draw, o.sp_handicap_away,
             p.prob_home, p.prob_draw, p.prob_away,
             p.value_spf_json, p.confidence
      FROM matches m
      LEFT JOIN odds_snapshots o ON m.match_id = o.match_id
      LEFT JOIN predictions p ON m.match_id = p.match_id
      WHERE m.match_date = ?
      ORDER BY m.match_time
    `).all(date);

    res.json({ success: true, date, count: matches.length, matches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

module.exports = router;
```

Write `server/routes/recommendations.js`:
```javascript
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/jingcai.db');

router.get('/', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const recs = db.prepare(`
      SELECT * FROM recommendations WHERE rec_date = ? ORDER BY rec_type, total_odds DESC
    `).all(date);

    const parsed = recs.map(r => ({
      ...r,
      matches_json: JSON.parse(r.matches_json || '[]'),
    }));

    res.json({ success: true, date, recommendations: parsed });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

router.get('/stats', (req, res) => {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as losses,
        SUM(stake) as total_stake,
        SUM(COALESCE(actual_payout, 0)) as total_payout
      FROM recommendations
    `).get();

    stats.win_rate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : 0;
    stats.roi = stats.total_stake > 0
      ? ((stats.total_payout - stats.total_stake) / stats.total_stake * 100).toFixed(1)
      : 0;

    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    db.close();
  }
});

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: Express API 服务"
```

---

### Task 11: Web 前端

**Files:**
- Create: `football-jingcai/web/index.html`
- Create: `football-jingcai/web/css/style.css`
- Create: `football-jingcai/web/js/app.js`

- [ ] **Step 1: 编写前端页面**

Write `web/index.html` (基于已有 football.html 风格):
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>竞彩智能分析 · 以小搏大</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="container">
  <header class="header">
    <h1>竞彩智能分析</h1>
    <p class="sub">以小搏大 · 串3串4 · 搏冷博大奖</p>
  </header>

  <div class="toolbar">
    <select id="dateSelect"></select>
    <button class="primary" onclick="refreshData()">刷新数据</button>
    <span class="status" id="status"></span>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="recommendations">推荐方案</button>
    <button class="tab" data-tab="matches">全部场次</button>
    <button class="tab" data-tab="tracking">命中追踪</button>
  </div>

  <div id="recommendations" class="tab-content active"></div>
  <div id="matches" class="tab-content"></div>
  <div id="tracking" class="tab-content"></div>
</div>

<script src="js/app.js"></script>
</body>
</html>
```

Write `web/css/style.css`:
```css
:root {
  --bg: #0d1117;
  --card: #161b22;
  --border: #30363d;
  --gold: #e3b341;
  --red: #f85149;
  --green: #3fb950;
  --blue: #58a6ff;
  --text: #c9d1d9;
  --dim: #8b949e;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--text);
  min-height: 100vh;
  padding: 16px;
  display: flex;
  justify-content: center;
}
.container { max-width: 960px; width: 100%; }
.header { text-align: center; padding: 20px 0; }
.header h1 {
  font-size: 28px;
  font-weight: 900;
  background: linear-gradient(180deg, #e3b341, #f0c060);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header .sub { font-size: 13px; color: var(--dim); margin-top: 4px; letter-spacing: 2px; }

.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  align-items: center;
}
.toolbar select, .toolbar button {
  padding: 8px 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.toolbar button.primary {
  background: var(--gold);
  color: #000;
  font-weight: 700;
  border: none;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 10px 20px;
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  font-size: 14px;
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: var(--gold);
  border-bottom-color: var(--gold);
}

.tab-content { display: none; }
.tab-content.active { display: block; }

.combo-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}
.combo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.combo-type {
  font-size: 14px;
  font-weight: 700;
  color: var(--gold);
}
.combo-odds {
  font-size: 20px;
  font-weight: 900;
  color: var(--red);
}
.combo-meta {
  font-size: 12px;
  color: var(--dim);
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}
.combo-leg {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255,255,255,.03);
  border-radius: 6px;
  margin-bottom: 6px;
}
.leg-match { font-size: 13px; font-weight: 600; }
.leg-pick {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 700;
}
.leg-pick.home { background: rgba(248,81,73,.15); color: var(--red); }
.leg-pick.draw { background: rgba(227,179,65,.15); color: var(--gold); }
.leg-pick.away { background: rgba(63,185,80,.15); color: var(--green); }
.leg-odds { font-size: 14px; font-weight: 800; color: var(--blue); }
.leg-value { font-size: 11px; color: var(--dim); }

.match-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 10px;
}
.match-teams {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}
.match-teams .team { font-size: 14px; font-weight: 700; }
.match-teams .vs { color: var(--dim); font-size: 12px; }
.match-league {
  font-size: 11px;
  color: var(--dim);
  background: rgba(255,255,255,.04);
  padding: 2px 10px;
  border-radius: 10px;
  display: inline-block;
  margin-bottom: 8px;
}
.match-odds {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.odd-btn {
  text-align: center;
  min-width: 60px;
  padding: 6px 10px;
  background: rgba(255,255,255,.03);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.odd-btn .label { font-size: 10px; color: var(--dim); }
.odd-btn .sp { font-size: 15px; font-weight: 800; }
.odd-sp-win { color: var(--red); }
.odd-sp-draw { color: var(--gold); }
.odd-sp-lose { color: var(--green); }

.value-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}
.value-high { background: rgba(248,81,73,.15); color: var(--red); }
.value-medium { background: rgba(227,179,65,.15); color: var(--gold); }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  text-align: center;
}
.stat-value {
  font-size: 24px;
  font-weight: 900;
  color: var(--gold);
}
.stat-label { font-size: 11px; color: var(--dim); margin-top: 4px; }
```

Write `web/js/app.js`:
```javascript
const API = '';

async function fetchJSON(url) {
  const resp = await fetch(API + url);
  return resp.json();
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function initDateSelect() {
  const sel = document.getElementById('dateSelect');
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const opt = document.createElement('option');
    opt.value = formatDate(d);
    opt.textContent = i === 0 ? `今天 (${formatDate(d)})` : formatDate(d);
    sel.appendChild(opt);
  }
}

function pickClass(outcome) {
  if (outcome === 'home' || outcome === '主胜') return 'home';
  if (outcome === 'draw' || outcome === '平') return 'draw';
  return 'away';
}

function renderRecommendations(recs) {
  const container = document.getElementById('recommendations');
  if (!recs.length) {
    container.innerHTML = '<div class="empty-state">暂无推荐方案</div>';
    return;
  }

  let html = '';
  for (const rec of recs) {
    const matches = rec.matches_json || [];
    const totalOdds = rec.total_odds || 0;
    const typeName = rec.rec_type === 'main' ? '主力串3' :
                     rec.rec_type === 'backup' ? '辅助串4' : '比分单挑';

    html += `
      <div class="combo-card">
        <div class="combo-header">
          <span class="combo-type">${typeName}</span>
          <span class="combo-odds">${totalOdds.toFixed(2)}x</span>
        </div>
        <div class="combo-meta">
          <span>投入: ${rec.stake}元</span>
          <span>预期回报: ${(rec.stake * totalOdds).toFixed(0)}元</span>
          <span>期望值: ${(rec.expected_value || 0).toFixed(2)}</span>
        </div>`;

    for (const m of matches) {
      const label = m.outcome === 'home' ? '主胜' :
                    m.outcome === 'draw' ? '平' :
                    m.outcome === 'away' ? '客胜' : m.outcome;
      html += `
        <div class="combo-leg">
          <span class="leg-match">${m.home_team || ''} vs ${m.away_team || ''}</span>
          <span class="leg-pick ${pickClass(m.outcome)}">${label}</span>
          <span class="leg-odds">${m.odds || '?'}</span>
          <span class="leg-value">价值 ${m.value_score || '?'}</span>
        </div>`;
    }

    html += '</div>';
  }

  container.innerHTML = html;
}

async function refreshData() {
  const date = document.getElementById('dateSelect').value;
  document.getElementById('status').textContent = '加载中...';

  try {
    const [recsData, matchesData] = await Promise.all([
      fetchJSON(`/api/recommendations?date=${date}`),
      fetchJSON(`/api/matches?date=${date}`),
    ]);

    renderRecommendations(recsData.recommendations || []);
    renderMatches(matchesData.matches || []);
    document.getElementById('status').textContent =
      `${matchesData.count || 0} 场比赛 | ${recsData.recommendations?.length || 0} 组方案`;
  } catch (e) {
    document.getElementById('status').textContent = '加载失败: ' + e.message;
  }
}

function renderMatches(matches) {
  const container = document.getElementById('matches');
  if (!matches.length) {
    container.innerHTML = '<div class="empty-state">暂无比赛数据</div>';
    return;
  }

  let html = '';
  for (const m of matches) {
    html += `
      <div class="match-card">
        <span class="match-league">${m.league_name}</span>
        <div class="match-teams">
          <span class="team">${m.home_team}</span>
          <span class="vs">VS</span>
          <span class="team">${m.away_team}</span>
        </div>
        <div class="match-odds">
          <div class="odd-btn"><div class="label">主胜</div><div class="sp odd-sp-win">${m.sp_home || '—'}</div></div>
          <div class="odd-btn"><div class="label">平</div><div class="sp odd-sp-draw">${m.sp_draw || '—'}</div></div>
          <div class="odd-btn"><div class="label">客胜</div><div class="sp odd-sp-lose">${m.sp_away || '—'}</div></div>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Init
initDateSelect();
refreshData();
```

- [ ] **Step 2: 测试 Web 服务**

```bash
cd /Users/xujiuying/football-jingcai/server
node app.js
```
Expected: 服务启动在 http://localhost:3000，浏览器可访问

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: Web 前端展示层"
```

---

## Phase 4: 学习迭代

### Task 12: 结果反馈与学习系统

**Files:**
- Create: `football-jingcai/analyzer/learning/feedback.py`
- Create: `football-jingcai/analyzer/learning/retrain.py`

- [ ] **Step 1: 编写结果反馈模块**

Write `analyzer/learning/feedback.py`:
```python
"""比赛结果反馈与学习"""
import json
import sqlite3
from config import DB_PATH


def record_result(db, match_id, home_score, away_score):
    """
    记录比赛结果并更新数据库

    返回: {'outcome': 'home'|'draw'|'away', 'total_goals': int}
    """
    db.execute('''
        UPDATE matches SET status = 'finished', home_score = ?, away_score = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE match_id = ?
    ''', (home_score, away_score, match_id))

    if home_score > away_score:
        outcome = 'home'
    elif home_score == away_score:
        outcome = 'draw'
    else:
        outcome = 'away'

    db.commit()
    return {'outcome': outcome, 'total_goals': home_score + away_score}


def evaluate_prediction(db, match_id):
    """
    评估预测结果

    返回: dict with prediction accuracy info
    """
    cursor = db.cursor()

    # 获取实际结果
    cursor.execute('SELECT home_score, away_score, status FROM matches WHERE match_id = ?', (match_id,))
    match = cursor.fetchone()
    if not match or match[2] != 'finished':
        return None

    home_score, away_score = match[0], match[1]
    if home_score > away_score:
        actual = 'home'
    elif home_score == away_score:
        actual = 'draw'
    else:
        actual = 'away'

    # 获取预测
    cursor.execute('''
        SELECT model_version, prob_home, prob_draw, prob_away, value_spf_json
        FROM predictions WHERE match_id = ? ORDER BY created_at DESC LIMIT 1
    ''', (match_id,))
    pred = cursor.fetchone()
    if not pred:
        return None

    model_version, prob_home, prob_draw, prob_away, value_json = pred

    probs = {'home': prob_home, 'draw': prob_draw, 'away': prob_away}
    predicted_prob = probs[actual]
    predicted_outcome = max(probs, key=probs.get)
    was_correct = predicted_outcome == actual

    # 获取当时赔率
    cursor.execute('''
        SELECT sp_home, sp_draw, sp_away FROM odds_snapshots
        WHERE match_id = ? ORDER BY snapshot_time DESC LIMIT 1
    ''', (match_id,))
    odds_row = cursor.fetchone()
    odds = {}
    if odds_row:
        odds = {'home': odds_row[0], 'draw': odds_row[1], 'away': odds_row[2]}

    actual_odds = odds.get(actual, 0)
    profit = (actual_odds - 1) if was_correct else -1

    # 写入学习日志
    db.execute('''
        INSERT INTO learning_log (match_id, model_version, predicted_outcome,
            predicted_prob, actual_outcome, was_correct, odds_at_time, profit_loss)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (match_id, model_version, predicted_outcome, predicted_prob,
          actual, was_correct, actual_odds, profit))
    db.commit()

    return {
        'match_id': match_id,
        'predicted': predicted_outcome,
        'actual': actual,
        'was_correct': was_correct,
        'predicted_prob': predicted_prob,
        'actual_odds': actual_odds,
        'profit': profit,
    }


def batch_evaluate(db, date_str):
    """批量评估某日所有已结束比赛"""
    cursor = db.execute('''
        SELECT match_id FROM matches
        WHERE match_date = ? AND status = 'finished'
    ''', (date_str,))

    results = []
    for row in cursor.fetchall():
        r = evaluate_prediction(db, row[0])
        if r:
            results.append(r)

    correct = sum(1 for r in results if r['was_correct'])
    total = len(results)
    accuracy = correct / total if total > 0 else 0

    return {
        'date': date_str,
        'total': total,
        'correct': correct,
        'accuracy': accuracy,
        'results': results,
    }
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: 结果反馈与学习系统"
```

---

## Phase 5: 运维脚本

### Task 13: 环境初始化与一键运行

**Files:**
- Create: `football-jingcai/scripts/setup.sh`
- Create: `football-jingcai/README.md`

- [ ] **Step 1: 编写环境初始化脚本**

Write `scripts/setup.sh`:
```bash
#!/bin/bash
set -e
echo "=== 竞彩智能分析系统 - 环境初始化 ==="

cd "$(dirname "$0")/.."

# Node.js 依赖
echo "[1/4] 安装 Node.js 依赖..."
cd collectors && npm install && cd ..
cd server && npm install && cd ..

# Python 环境
echo "[2/4] 配置 Python 环境..."
cd analyzer
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

# 初始化数据库
echo "[3/4] 初始化数据库..."
cd collectors && node -e "require('./utils/db').initDatabase()" && cd ..

echo "[4/4] 初始化完成!"
echo ""
echo "使用方式:"
echo "  1. 采集数据: cd collectors && node index.js --now"
echo "  2. 运行分析: cd analyzer && source venv/bin/activate && python main.py"
echo "  3. 启动 Web: cd server && node app.js"
echo "  4. 一键运行: ./scripts/daily.sh"
```

```bash
chmod +x scripts/setup.sh scripts/daily.sh
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: 运维脚本和 README"
```

---

## Summary

| Phase | Task | 内容 | 状态 |
|-------|------|------|------|
| 1 | 1 | 项目初始化与数据库 | - [ ] |
| 1 | 2 | 500.com 竞彩数据采集 | - [ ] |
| 1 | 3 | FlashScore 比赛数据采集 | - [ ] |
| 1 | 4 | 采集调度器 | - [ ] |
| 2 | 5 | 泊松分布进球模型 | - [ ] |
| 2 | 6 | Elo 评分系统 | - [ ] |
| 2 | 7 | 价值评估与 Kelly 公式 | - [ ] |
| 2 | 8 | 特征工程 | - [ ] |
| 2 | 9 | 集成模型与分析主入口 | - [ ] |
| 3 | 10 | Express API 服务 | - [ ] |
| 3 | 11 | Web 前端 | - [ ] |
| 4 | 12 | 结果反馈与学习系统 | - [ ] |
| 5 | 13 | 环境初始化与一键运行 | - [ ] |
