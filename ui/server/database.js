const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize SQLite database
const dbPath = path.join(__dirname, 'airdrop.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table for eligibility
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT UNIQUE NOT NULL,
        email TEXT,
        is_eligible BOOLEAN DEFAULT 0,
        airdrop_amount DECIMAL(18, 8) DEFAULT 0,
        has_claimed BOOLEAN DEFAULT 0,
        claimed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Airdrops table for different airdrop campaigns
      db.run(`CREATE TABLE IF NOT EXISTS airdrops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        total_supply DECIMAL(18, 8),
        start_date DATETIME,
        end_date DATETIME,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // User airdrops junction table
      db.run(`CREATE TABLE IF NOT EXISTS user_airdrops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        airdrop_id INTEGER,
        allocation DECIMAL(18, 8),
        claimed BOOLEAN DEFAULT 0,
        claimed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (airdrop_id) REFERENCES airdrops (id)
      )`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
};

module.exports = {
  db,
  initializeDatabase
};