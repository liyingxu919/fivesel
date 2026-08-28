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
