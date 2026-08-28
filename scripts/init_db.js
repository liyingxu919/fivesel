const { initDatabase, DEFAULT_DB_PATH } = require('../collectors/utils/db');

console.log(`Initializing database at: ${DEFAULT_DB_PATH}`);
const db = initDatabase();
console.log('Database initialized with all tables.');
db.close();
