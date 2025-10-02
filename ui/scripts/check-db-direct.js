const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use the same path logic as the server
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../server/airdrop.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

const testAddress = '0x077b8Ed8356a7C1F0903Fc4bA6E15F9b09CF437ce04f21B2cBf32dC2790183d0';
const normalizedAddress = '0x' + testAddress.slice(2).replace(/^0+/, '');

console.log('Looking for address:', testAddress);
console.log('Normalized address:', normalizedAddress);

db.serialize(() => {
  // Check users
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (err) {
      console.error('Error counting users:', err);
    } else {
      console.log('\nTotal users:', row.count);
    }
  });

  // Check specific user
  db.get(
    `SELECT * FROM users WHERE wallet_address = ? OR wallet_address = ?`,
    [testAddress.toLowerCase(), normalizedAddress.toLowerCase()],
    (err, row) => {
      if (err) {
        console.error('Error finding user:', err);
      } else if (row) {
        console.log('\nFound user:', JSON.stringify(row, null, 2));
      } else {
        console.log('\nUser not found with either address format');
      }
    }
  );

  // Sample addresses
  db.all(`SELECT wallet_address FROM users WHERE wallet_address LIKE '%77b8%' LIMIT 10`, (err, rows) => {
    if (err) {
      console.error('Error sampling addresses:', err);
    } else {
      console.log('\nSample addresses containing 77b8:');
      rows.forEach(row => console.log(row.wallet_address));
    }
    
    db.close();
  });
});