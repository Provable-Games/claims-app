import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const sqlite = sqlite3.verbose();

// Initialize SQLite database with secure settings
// Use DATABASE_PATH from environment, or default to local path
const dbPath: string = process.env.DATABASE_PATH || path.join(__dirname, 'airdrop.db');
console.log('Using database at:', dbPath);
const dbDir = path.dirname(dbPath);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: sqlite3.Database = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    // Enable Write-Ahead Logging for better concurrency
    db.run('PRAGMA journal_mode = WAL');
    // Enable foreign key constraints
    db.run('PRAGMA foreign_keys = ON');
    // Restrict database file permissions (production only)
    if (process.env.NODE_ENV === 'production') {
      try {
        fs.chmodSync(dbPath, 0o600); // Read/write for owner only
      } catch (e) {
        console.warn('Could not set database file permissions:', e);
      }
    }
  }
});

// Initialize database tables
const initializeDatabase = (): Promise<void> => {
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
      )`, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
};

export {
  db,
  initializeDatabase
};