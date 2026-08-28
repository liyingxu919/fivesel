const { parseMatchRows, saveMatchesToDB } = require('../jczq-500');
const Database = require('better-sqlite3');

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
  expect(matches[0].matchDate).toBe('2026-08-28');
  expect(matches[0].matchTime).toBe('20:00');
  expect(matches[0].buyDeadline).toBe('2026-08-28 19:45');
  expect(matches[0].handicap).toBe(-1);
  expect(matches[0].odds.spf.home).toBe(1.55);
  expect(matches[0].odds.spf.draw).toBe(3.80);
  expect(matches[0].odds.spf.away).toBe(4.50);
  expect(matches[0].odds.hhspf.home).toBe(2.80);
  expect(matches[0].odds.hhspf.draw).toBe(3.20);
  expect(matches[0].odds.hhspf.away).toBe(2.10);
  expect(matches[0].odds.hhspf.handicap).toBe(-1);
  expect(matches[0].homeRank).toBe(1);
  expect(matches[0].awayRank).toBe(3);
});

test('parseMatchRows handles empty HTML', () => {
  expect(parseMatchRows('')).toEqual([]);
  expect(parseMatchRows('<html><body>no matches</body></html>')).toEqual([]);
});

test('parseMatchRows extracts multiple matches', () => {
  const html = `
    <tr data-matchnum="周四001" data-homesxname="主队A" data-awaysxname="客队A"
        data-simpleleague="英超" data-matchdate="2026-08-28" data-matchtime="20:00"
        data-buyendtime="2026-08-28 19:45" data-rangqiu="1">
      <td data-sp="1.50"></td><td data-sp="3.60"></td><td data-sp="5.00"></td>
      <td data-sp="2.50"></td><td data-sp="3.10"></td><td data-sp="2.40"></td>
    </tr>
    <tr data-matchnum="周四002" data-homesxname="主队B" data-awaysxname="客队B"
        data-simpleleague="西甲" data-matchdate="2026-08-28" data-matchtime="22:00"
        data-buyendtime="2026-08-28 21:45" data-rangqiu="0">
      <td data-sp="2.20"></td><td data-sp="3.20"></td><td data-sp="2.80"></td>
      <td data-sp="1.80"></td><td data-sp="3.50"></td><td data-sp="3.60"></td>
    </tr>
  `;

  const matches = parseMatchRows(html);
  expect(matches).toHaveLength(2);
  expect(matches[0].matchId).toBe('周四001');
  expect(matches[0].leagueName).toBe('英超');
  expect(matches[1].matchId).toBe('周四002');
  expect(matches[1].leagueName).toBe('西甲');
  expect(matches[1].handicap).toBe(0);
});

test('parseMatchRows falls back to short names when no title attributes', () => {
  const html = `
    <tr data-matchnum="周四003" data-homesxname="拜仁" data-awaysxname="多特"
        data-simpleleague="德甲" data-matchdate="2026-08-29" data-matchtime="21:30"
        data-rangqiu="-2">
      <td data-sp="1.30"></td><td data-sp="4.80"></td><td data-sp="7.00"></td>
      <td data-sp="2.10"></td><td data-sp="3.40"></td><td data-sp="2.90"></td>
    </tr>
  `;

  const matches = parseMatchRows(html);
  expect(matches).toHaveLength(1);
  expect(matches[0].homeTeam).toBe('拜仁');
  expect(matches[0].awayTeam).toBe('多特');
  expect(matches[0].homeRank).toBeNull();
  expect(matches[0].awayRank).toBeNull();
  expect(matches[0].buyDeadline).toBe('2026-08-29 21:30');
});

test('saveMatchesToDB persists matches and odds to SQLite', () => {
  const db = new Database(':memory:');

  // Create the tables as they exist in the schema
  db.exec(`
    CREATE TABLE matches (
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
    CREATE TABLE odds_snapshots (
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
  `);

  const matches = [
    {
      matchId: '周四001',
      matchDate: '2026-08-28',
      matchTime: '20:00',
      buyDeadline: '2026-08-28 19:45',
      leagueName: '英超',
      homeTeam: '曼城',
      awayTeam: '利物浦',
      homeRank: 1,
      awayRank: 3,
      handicap: -1,
      odds: {
        spf: { home: 1.55, draw: 3.80, away: 4.50 },
        hhspf: { home: 2.80, draw: 3.20, away: 2.10, handicap: -1 },
      },
    },
  ];

  const count = saveMatchesToDB(db, matches);
  expect(count).toBe(1);

  const row = db.prepare('SELECT * FROM matches WHERE match_id = ?').get('周四001');
  expect(row).toBeDefined();
  expect(row.home_team).toBe('曼城');
  expect(row.away_team).toBe('利物浦');
  expect(row.handicap).toBe(-1);

  const odds = db.prepare('SELECT * FROM odds_snapshots WHERE match_id = ?').get('周四001');
  expect(odds).toBeDefined();
  expect(odds.sp_home).toBe(1.55);
  expect(odds.sp_draw).toBe(3.80);
  expect(odds.sp_away).toBe(4.50);
  expect(odds.sp_handicap_home).toBe(2.80);

  db.close();
});

test('saveMatchesToDB upserts on repeated calls', () => {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE matches (
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
    CREATE TABLE odds_snapshots (
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
  `);

  const matches = [
    {
      matchId: '周四001',
      matchDate: '2026-08-28',
      matchTime: '20:00',
      buyDeadline: '2026-08-28 19:45',
      leagueName: '英超',
      homeTeam: '曼城',
      awayTeam: '利物浦',
      homeRank: 1,
      awayRank: 3,
      handicap: -1,
      odds: {
        spf: { home: 1.55, draw: 3.80, away: 4.50 },
        hhspf: { home: 2.80, draw: 3.20, away: 2.10, handicap: -1 },
      },
    },
  ];

  saveMatchesToDB(db, matches);

  // Update odds and save again
  matches[0].odds.spf.home = 1.60;
  saveMatchesToDB(db, matches);

  // Match row should be updated
  const row = db.prepare('SELECT * FROM matches WHERE match_id = ?').get('周四001');
  expect(row).toBeDefined();

  // There should be 2 odds snapshots (one per save call)
  const oddsRows = db.prepare('SELECT * FROM odds_snapshots WHERE match_id = ?').all('周四001');
  expect(oddsRows).toHaveLength(2);

  db.close();
});
