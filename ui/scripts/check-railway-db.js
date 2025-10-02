const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('Environment check:');
console.log('DATABASE_PATH:', process.env.DATABASE_PATH);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Running locally with Railway env vars');

// For Railway, we need to use a local database when running commands locally
const isRailwayRun = process.env.DATABASE_PATH && process.env.DATABASE_PATH.startsWith('/app/');
const dbPath = isRailwayRun 
  ? path.join(__dirname, '../dist/server/railway-airdrop.db')
  : (process.env.DATABASE_PATH || path.join(__dirname, '../server/airdrop.db'));

console.log('\nUsing database path:', dbPath);

// Check if local database exists
if (fs.existsSync(dbPath)) {
  console.log('Database file exists');
  
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening database:', err);
    } else {
      console.log('Database opened successfully');
      
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) {
          console.error('Error counting users:', err);
        } else {
          console.log('Total users in database:', row.count);
        }
        db.close();
      });
    }
  });
} else {
  console.log('Database file does not exist at:', dbPath);
  console.log('\nThe database needs to be created/migrated on Railway.');
  console.log('Since Railway uses a persistent volume at /app/data, you need to:');
  console.log('1. Deploy your app with railway up');
  console.log('2. SSH into the Railway container to run migrations');
  console.log('3. Or create a web endpoint to trigger the migration');
}