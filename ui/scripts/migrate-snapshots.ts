import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const sqlite = sqlite3.verbose();
const dbPath = path.join(__dirname, '../server/airdrop.db');
const db = new sqlite.Database(dbPath);

interface SnapshotData {
  block_height: number;
  chain_id: string;
  claim_contract: string;
  contract_address: string;
  description: string;
  entrypoint: string;
  name: string;
  network: string;
  snapshot: [string, string[]][];
}

// Add new tables for collections and holdings
const createTables = () => {
  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      // Collections table
      db.run(`CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contract_address TEXT,
        network TEXT,
        description TEXT,
        block_height INTEGER,
        chain_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // User holdings table
      db.run(`CREATE TABLE IF NOT EXISTS user_holdings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        collection_id INTEGER,
        token_ids TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (collection_id) REFERENCES collections (id)
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

// Import snapshot data
const importSnapshot = async (filePath: string) => {
  const data: SnapshotData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  console.log(`Importing ${data.name} from ${data.network}...`);
  
  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      // Insert collection
      db.run(
        `INSERT OR IGNORE INTO collections (name, contract_address, network, description, block_height, chain_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.name, data.contract_address, data.network, data.description, data.block_height, data.chain_id],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          const collectionId = this.lastID;
          const stmt = db.prepare(`INSERT OR IGNORE INTO users (wallet_address, is_eligible) VALUES (?, ?)`);
          const holdingStmt = db.prepare(`INSERT INTO user_holdings (user_id, collection_id, token_ids) VALUES (?, ?, ?)`);
          
          // Process each holder
          data.snapshot.forEach(([address, tokenIds]) => {
            stmt.run(address.toLowerCase(), 1, function(err: any) {
              if (!err) {
                // Get user ID
                db.get(
                  `SELECT id FROM users WHERE wallet_address = ?`,
                  [address.toLowerCase()],
                  (err: any, user: any) => {
                    if (!err && user) {
                      holdingStmt.run(user.id, collectionId, JSON.stringify(tokenIds));
                    }
                  }
                );
              }
            });
          });
          
          stmt.finalize(() => {
            holdingStmt.finalize(() => {
              console.log(`✓ Imported ${data.snapshot.length} holders for ${data.name}`);
              resolve();
            });
          });
        }
      );
    });
  });
};

// Main migration function
const migrate = async () => {
  try {
    await createTables();
    
    const snapshotsDir = path.join(__dirname, '../../snapshots');
    const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'));
    
    console.log(`Found ${files.length} snapshot files`);
    
    for (const file of files) {
      await importSnapshot(path.join(snapshotsDir, file));
    }
    
    // Update airdrop amounts based on holdings count
    db.run(`
      UPDATE users 
      SET airdrop_amount = (
        SELECT COUNT(DISTINCT collection_id) * 100 
        FROM user_holdings 
        WHERE user_holdings.user_id = users.id
      )
      WHERE is_eligible = 1
    `, (err: any) => {
      if (err) console.error('Error updating airdrop amounts:', err);
      else console.log('✓ Updated airdrop amounts based on holdings');
    });
    
    console.log('Migration completed successfully!');
    db.close();
  } catch (error) {
    console.error('Migration failed:', error);
    db.close();
  }
};

migrate();