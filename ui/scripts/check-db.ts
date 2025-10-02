import { db } from '../server/database';

console.log('Checking database status...\n');

const testAddress = '0x077b8Ed8356a7C1F0903Fc4bA6E15F9b09CF437ce04f21B2cBf32dC2790183d0';
const normalizedAddress = '0x' + testAddress.slice(2).replace(/^0+/, '');

console.log('Looking for address:', testAddress);
console.log('Normalized address:', normalizedAddress);

// Check collections
db.get('SELECT COUNT(*) as count FROM collections', (err: any, row: any) => {
  if (err) {
    console.error('Error checking collections:', err);
  } else {
    console.log(`\nCollections in database: ${row.count}`);
  }
});

// Check users
db.get('SELECT COUNT(*) as count FROM users', (err: any, row: any) => {
  if (err) {
    console.error('Error checking users:', err);
  } else {
    console.log(`Users in database: ${row.count}`);
  }
});

// Check specific user
db.get(
  `SELECT * FROM users WHERE wallet_address = ? OR wallet_address = ?`,
  [testAddress.toLowerCase(), normalizedAddress.toLowerCase()],
  (err: any, row: any) => {
    if (err) {
      console.error('Error finding user:', err);
    } else if (row) {
      console.log('\nFound user:', row);
    } else {
      console.log('\nUser not found');
    }
  }
);

// Sample addresses
db.all(`SELECT wallet_address FROM users WHERE wallet_address LIKE '%77b8%' LIMIT 10`, (err: any, rows: any[]) => {
  if (err) {
    console.error('Error sampling addresses:', err);
  } else {
    console.log('\nSample addresses containing 77b8:');
    rows.forEach(row => console.log(row.wallet_address));
  }
});

// Check user holdings
db.get('SELECT COUNT(*) as count FROM user_holdings', (err: any, row: any) => {
  if (err) {
    console.error('Error checking user_holdings:', err);
  } else {
    console.log(`\nUser holdings in database: ${row.count}`);
  }
  
  // Close database after all queries
  setTimeout(() => {
    db.close();
    console.log('\nDatabase check complete.');
  }, 2000);
});