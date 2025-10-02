const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use DATABASE_PATH env var if available (for Railway), otherwise use local path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../server/airdrop.db');
const dbDir = path.dirname(dbPath);

console.log('Database path:', dbPath);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('Created directory:', dbDir);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

console.log('Resetting migration status...');

db.serialize(() => {
  // Drop collections table to allow fresh migration
  db.run('DROP TABLE IF EXISTS collections', (err) => {
    if (err) {
      console.error('Error dropping collections table:', err);
    } else {
      console.log('Dropped collections table');
    }
  });
  
  db.run('DROP TABLE IF EXISTS user_holdings', (err) => {
    if (err) {
      console.error('Error dropping user_holdings table:', err);
    } else {
      console.log('Dropped user_holdings table');
    }
  });
  
  db.run('DELETE FROM users', (err) => {
    if (err) {
      console.error('Error clearing users table:', err);
    } else {
      console.log('Cleared users table');
    }
    
    db.close(() => {
      console.log('Migration reset complete. You can now run migrate:prod again.');
    });
  });
});