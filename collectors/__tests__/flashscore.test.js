const axios = require('axios');
const Database = require('better-sqlite3');
const { searchTeam, saveMatchDetails, fetchMatchDetails, fetchTeamResults, fetchH2H } = require('../flashscore');

jest.mock('axios');

// Suppress logger output during tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

function createTestDB() {
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
    CREATE TABLE match_details (
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
  `);
  // Insert a match so FK constraint is satisfied
  db.prepare(`INSERT INTO matches (match_id, home_team, away_team) VALUES (?, ?, ?)`)
    .run('test001', 'Home FC', 'Away FC');
  return db;
}

describe('searchTeam', () => {
  afterEach(() => jest.resetAllMocks());

  test('returns filtered football teams from API', async () => {
    axios.get.mockResolvedValue({
      data: [
        { id: 'abc123', name: 'Manchester City', sport: { id: 1 }, type: { id: 2 }, country: { name: 'England' } },
        { id: 'def456', name: 'Manchester United', sport: { id: 1 }, type: { id: 2 }, country: { name: 'England' } },
        { id: 'xyz789', name: 'Manchester NBA Team', sport: { id: 2 }, type: { id: 2 }, country: { name: 'USA' } },
        { id: 'ghi012', name: 'Some League', sport: { id: 1 }, type: { id: 1 }, country: { name: 'England' } },
      ],
    });

    const results = await searchTeam('Manchester');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 'abc123', name: 'Manchester City', country: 'England' });
    expect(results[1]).toEqual({ id: 'def456', name: 'Manchester United', country: 'England' });
  });

  test('returns empty array when API returns no matching teams', async () => {
    axios.get.mockResolvedValue({ data: [] });
    const results = await searchTeam('xyznonexistent123');
    expect(results).toEqual([]);
  });

  test('returns empty array when API call fails', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));
    const results = await searchTeam('SomeTeam');
    expect(results).toEqual([]);
  });

  test('handles missing country field gracefully', async () => {
    axios.get.mockResolvedValue({
      data: [
        { id: 'no1', name: 'No Country FC', sport: { id: 1 }, type: { id: 2 } },
      ],
    });
    const results = await searchTeam('No Country');
    expect(results).toHaveLength(1);
    expect(results[0].country).toBe('');
  });

  test('sends correct query params to axios', async () => {
    axios.get.mockResolvedValue({ data: [] });
    await searchTeam('TestTeam');
    expect(axios.get).toHaveBeenCalledWith(
      'https://s.livesport.services/api/v2/search/',
      expect.objectContaining({
        params: {
          q: 'TestTeam',
          'lang-id': 13,
          'type-ids': '1,2,3,4',
          'project-id': 202,
          'project-type-id': 1,
        },
      })
    );
  });
});

describe('saveMatchDetails', () => {
  let db;

  beforeEach(() => {
    db = createTestDB();
  });

  afterEach(() => db.close());

  test('inserts match details into database', () => {
    const details = {
      homeForm: { results: ['W', 'D', 'L'] },
      awayForm: { results: ['L', 'W', 'W'] },
      h2h: { total: { matches: 10 } },
      homeStats: null,
      awayStats: null,
      standings: null,
    };

    saveMatchDetails(db, 'test001', details);

    const row = db.prepare('SELECT * FROM match_details WHERE match_id = ?').get('test001');
    expect(row).toBeDefined();
    expect(JSON.parse(row.home_form_json)).toEqual({ results: ['W', 'D', 'L'] });
    expect(JSON.parse(row.away_form_json)).toEqual({ results: ['L', 'W', 'W'] });
    expect(JSON.parse(row.h2h_json)).toEqual({ total: { matches: 10 } });
    expect(row.home_stats_json).toBe('null');
    expect(row.away_stats_json).toBe('null');
    expect(row.standings_json).toBe('null');
  });

  test('upserts on repeated calls with same match_id', () => {
    const details1 = { homeForm: { a: 1 }, awayForm: null, h2h: null, homeStats: null, awayStats: null, standings: null };
    const details2 = { homeForm: { a: 2 }, awayForm: { b: 1 }, h2h: { c: 3 }, homeStats: null, awayStats: null, standings: null };

    saveMatchDetails(db, 'test001', details1);
    saveMatchDetails(db, 'test001', details2);

    const rows = db.prepare('SELECT * FROM match_details WHERE match_id = ?').all('test001');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].home_form_json)).toEqual({ a: 2 });
    expect(JSON.parse(rows[0].away_form_json)).toEqual({ b: 1 });
    expect(JSON.parse(rows[0].h2h_json)).toEqual({ c: 3 });
  });

  test('handles undefined fields by storing null', () => {
    const details = { homeForm: { x: 1 } };
    saveMatchDetails(db, 'test001', details);

    const row = db.prepare('SELECT * FROM match_details WHERE match_id = ?').get('test001');
    expect(JSON.parse(row.home_form_json)).toEqual({ x: 1 });
    expect(row.away_form_json).toBe('null');
    expect(row.h2h_json).toBe('null');
  });
});

describe('fetchMatchDetails', () => {
  let db;

  beforeEach(() => {
    db = createTestDB();
    jest.resetAllMocks();
  });

  afterEach(() => db.close());

  test('fetches data from APIs and saves to DB', async () => {
    const homeResultsPayload = { results: ['W', 'W'] };
    const awayResultsPayload = { results: ['L', 'D'] };
    const h2hPayload = { total: { matches: 5 } };

    axios.get
      .mockResolvedValueOnce({ data: homeResultsPayload })
      .mockResolvedValueOnce({ data: awayResultsPayload })
      .mockResolvedValueOnce({ data: h2hPayload });

    const details = await fetchMatchDetails(db, 'test001', 'team1', 'team2');

    expect(details.homeForm).toEqual(homeResultsPayload);
    expect(details.awayForm).toEqual(awayResultsPayload);
    expect(details.h2h).toEqual(h2hPayload);
    expect(details.homeStats).toBeNull();
    expect(details.awayStats).toBeNull();
    expect(details.standings).toBeNull();

    // Verify data was saved to DB
    const row = db.prepare('SELECT * FROM match_details WHERE match_id = ?').get('test001');
    expect(row).toBeDefined();
    expect(JSON.parse(row.home_form_json)).toEqual(homeResultsPayload);
    expect(JSON.parse(row.h2h_json)).toEqual(h2hPayload);
  });

  test('handles API failures gracefully', async () => {
    axios.get
      .mockRejectedValueOnce(new Error('Home results failed'))
      .mockResolvedValueOnce({ data: { results: ['W'] } })
      .mockResolvedValueOnce({ data: { h2h: true } });

    const details = await fetchMatchDetails(db, 'test001', 'team1', 'team2');

    // Home results should be null (API failed), others should have data (resp.data extracted)
    expect(details.homeForm).toBeNull();
    expect(details.awayForm).toEqual({ results: ['W'] });
    expect(details.h2h).toEqual({ h2h: true });

    // Data should still be saved to DB
    const row = db.prepare('SELECT * FROM match_details WHERE match_id = ?').get('test001');
    expect(row).toBeDefined();
    expect(row.home_form_json).toBe('null');
  });

  test('calls APIs sequentially with >= 1s delay between each', async () => {
    jest.useFakeTimers();

    const callTimestamps = [];
    axios.get.mockImplementation((url) => {
      callTimestamps.push(Date.now());
      return Promise.resolve({ data: {} });
    });

    const promise = fetchMatchDetails(db, 'test001', 'team1', 'team2');

    // First call fires immediately (no sleep before it)
    await jest.advanceTimersByTimeAsync(0);
    expect(callTimestamps).toHaveLength(1);

    // After 1s delay, second call fires
    await jest.advanceTimersByTimeAsync(1000);
    expect(callTimestamps).toHaveLength(2);

    // After another 1s delay, third call fires
    await jest.advanceTimersByTimeAsync(1000);
    expect(callTimestamps).toHaveLength(3);

    await promise;
    jest.useRealTimers();
  });
});

describe('fetchTeamResults', () => {
  afterEach(() => jest.resetAllMocks());

  test('fetches team results by team ID', async () => {
    const mockData = { results: ['W', 'D', 'L'] };
    axios.get.mockResolvedValue({ data: mockData });

    const result = await fetchTeamResults('team123');
    expect(result).toEqual(mockData);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('team_results_team123'),
      expect.objectContaining({ headers: expect.any(Object), timeout: 10000 })
    );
  });

  test('returns null on API failure', async () => {
    axios.get.mockRejectedValue(new Error('Not found'));
    const result = await fetchTeamResults('bad_id');
    expect(result).toBeNull();
  });
});

describe('fetchH2H', () => {
  afterEach(() => jest.resetAllMocks());

  test('fetches H2H data for two teams', async () => {
    const mockH2H = { total: { matches: 15, homeWins: 6, awayWins: 4, draws: 5 } };
    axios.get.mockResolvedValue({ data: mockH2H });

    const result = await fetchH2H('home1', 'away1');
    expect(result).toEqual(mockH2H);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('h2h_home1_away1'),
      expect.objectContaining({ headers: expect.any(Object), timeout: 10000 })
    );
  });

  test('returns null on API failure', async () => {
    axios.get.mockRejectedValue(new Error('Timeout'));
    const result = await fetchH2H('home1', 'away1');
    expect(result).toBeNull();
  });
});
