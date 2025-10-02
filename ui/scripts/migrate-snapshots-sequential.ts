import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const sqlite = sqlite3.verbose();

// Use DATABASE_PATH env var if available (for Railway), otherwise use local path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../server/airdrop.db');
const dbDir = path.dirname(dbPath);

// Ensure database directory exists (only if not using Railway's DATABASE_PATH)
if (!process.env.DATABASE_PATH || !process.env.DATABASE_PATH.startsWith('/app/')) {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

console.log('Using database at:', dbPath);

// Create a new database connection for migration
let db: sqlite3.Database | null = null;

// Helper to ensure database is closed
const closeDatabase = () => {
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err);
      else console.log('Database connection closed');
    });
    db = null;
  }
};

// Create new database connection with exclusive mode for migration
const initDatabase = (): Promise<sqlite3.Database> => {
  return new Promise((resolve, reject) => {
    // Close any existing connection first
    if (db) {
      db.close();
      db = null;
    }
    
    // Open new connection with timeout
    const database = new sqlite.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('Failed to open database:', err);
        reject(err);
      } else {
        db = database;
        // Set busy timeout to wait if database is locked
        db.run('PRAGMA busy_timeout = 30000', (err) => { // 30 seconds
          if (err) {
            console.error('Failed to set busy timeout:', err);
            reject(err);
          } else {
            resolve(database);
          }
        });
      }
    });
  });
};

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
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    db!.serialize(() => {
      // Collections table
      db!.run(`CREATE TABLE IF NOT EXISTS collections (
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
      db!.run(`CREATE TABLE IF NOT EXISTS user_holdings (
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

// Process holders in batches with transaction
const processHolders = (holders: [string, string[]][], collectionId: number): Promise<number> => {
  return new Promise(async (resolve, reject) => {
    let processed = 0;
    
    try {
      // Start transaction
      await new Promise<void>((res, rej) => {
        db!.run('BEGIN TRANSACTION', (err) => err ? rej(err) : res());
      });
      
      // Prepare statements for batch processing
      const userStmt = db!.prepare(`INSERT OR IGNORE INTO users (wallet_address, is_eligible) VALUES (?, ?)`);
      const selectStmt = db!.prepare(`SELECT id FROM users WHERE wallet_address = ?`);
      const holdingsStmt = db!.prepare(`INSERT INTO user_holdings (user_id, collection_id, token_ids) VALUES (?, ?, ?)`);
      
      // Process in chunks
      const chunkSize = 100;
      for (let i = 0; i < holders.length; i += chunkSize) {
        const chunk = holders.slice(i, i + chunkSize);
        
        for (const [address, tokenIds] of chunk) {
          // Insert user
          await new Promise<void>((res) => {
            userStmt.run([address.toLowerCase(), 1], (err) => {
              if (err) console.error(`Error inserting user ${address}:`, err);
              res();
            });
          });
          
          // Get user ID and insert holdings
          await new Promise<void>((res) => {
            selectStmt.get([address.toLowerCase()], (err: any, user: any) => {
              if (!err && user) {
                holdingsStmt.run([user.id, collectionId, JSON.stringify(tokenIds)], (err) => {
                  if (!err) processed++;
                  res();
                });
              } else {
                res();
              }
            });
          });
        }
        
        // Log progress for large collections
        if (holders.length > 1000 && i % 1000 === 0) {
          console.log(`  Processed ${i}/${holders.length} holders...`);
        }
      }
      
      // Finalize statements
      await new Promise<void>((res) => userStmt.finalize(() => res()));
      await new Promise<void>((res) => selectStmt.finalize(() => res()));
      await new Promise<void>((res) => holdingsStmt.finalize(() => res()));
      
      // Commit transaction
      await new Promise<void>((res, rej) => {
        db!.run('COMMIT', (err) => err ? rej(err) : res());
      });
      
      resolve(processed);
    } catch (error) {
      // Rollback on error
      await new Promise<void>((res) => {
        db!.run('ROLLBACK', () => res());
      });
      reject(error);
    }
  });
};

// Import snapshot data
const importSnapshot = async (filePath: string): Promise<void> => {
  const data: SnapshotData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  console.log(`Importing ${data.name} from ${data.network}...`);
  
  return new Promise<void>((resolve, reject) => {
    // Insert collection
    db!.run(
      `INSERT OR IGNORE INTO collections (name, contract_address, network, description, block_height, chain_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.contract_address, data.network, data.description, data.block_height, data.chain_id],
      async function(err) {
        if (err) {
          console.error(`Error inserting collection ${data.name}:`, err);
          resolve();
          return;
        }
        
        const collectionId = this.lastID;
        
        try {
          const processed = await processHolders(data.snapshot, collectionId);
          console.log(`✓ Imported ${processed} holders for ${data.name}`);
          resolve();
        } catch (error) {
          console.error(`Error processing holders for ${data.name}:`, error);
          resolve();
        }
      }
    );
  });
};

// Check if migration has already been run
const checkMigrationStatus = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!db) {
      resolve(false);
      return;
    }
    db.get(`SELECT COUNT(*) as count FROM collections`, (err: any, row: any) => {
      if (err || !row) {
        resolve(false);
      } else {
        resolve(row.count > 0);
      }
    });
  });
};

// Main migration function with timeout
const migrate = async () => {
  // Set a timeout for the entire migration
  const migrationTimeout = setTimeout(() => {
    console.error('Migration timeout - forcibly closing database');
    closeDatabase();
    process.exit(1);
  }, 10 * 60 * 1000); // 10 minute timeout
  
  try {
    // Initialize database connection
    await initDatabase();
    
    if (!db) {
      throw new Error('Failed to initialize database');
    }
    
    // Set performance optimizations for migration
    await new Promise<void>((resolve, reject) => {
      db!.serialize(() => {
        // Optimize for bulk inserts
        db!.run('PRAGMA synchronous = OFF');
        db!.run('PRAGMA journal_mode = MEMORY');
        db!.run('PRAGMA temp_store = MEMORY');
        db!.run('PRAGMA cache_size = 10000', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    
    await createTables();
    
    // Check if migration has already been run
    const alreadyMigrated = await checkMigrationStatus();
    if (alreadyMigrated) {
      console.log('Migration already completed. Skipping...');
      closeDatabase();
      return;
    }
    
    // Try multiple possible locations for snapshots
    const possiblePaths = [
      path.join(__dirname, '../../../snapshots'), // Local dev
      path.join(__dirname, '../../snapshots'),     // Alternative local
      '/app/snapshots',                             // Railway root
      path.join(process.cwd(), 'snapshots'),        // Current working directory
      path.join(process.cwd(), 'snapshots-temp'),  // Uploaded snapshots
      path.join(process.cwd(), '../snapshots'),     // Parent of cwd
    ];
    
    let snapshotsDir = '';
    for (const testPath of possiblePaths) {
      console.log(`Checking for snapshots at: ${testPath}`);
      if (fs.existsSync(testPath)) {
        snapshotsDir = testPath;
        break;
      }
    }
    
    if (!snapshotsDir) {
      console.error('Snapshots directory not found in any of the expected locations');
      console.log('Current directory:', __dirname);
      console.log('Process cwd:', process.cwd());
      closeDatabase();
      return;
    }
    
    console.log(`Found snapshots at: ${snapshotsDir}`);
    
    const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'));
    
    console.log(`Found ${files.length} snapshot files`);
    
    // Process files sequentially
    for (const file of files) {
      await importSnapshot(path.join(snapshotsDir, file));
    }
    
    // Import aggregated airdrop amounts
    console.log('Importing pre-calculated airdrop amounts...');
    
    // Load aggregation files - only use the aggregated files for ethereum and direct file for starknet
    const aggregationPaths = [
      path.join(__dirname, '../../../aggregations/processed_rewards_ethereum_aggregated.json'),
      path.join(__dirname, '../../../aggregations/processed_rewards_starknet.json'),
      path.join(process.cwd(), 'aggregations/processed_rewards_ethereum_aggregated.json'),
      path.join(process.cwd(), 'aggregations/processed_rewards_starknet.json'),
      '/app/aggregations/processed_rewards_ethereum_aggregated.json',
      '/app/aggregations/processed_rewards_starknet.json'
    ];
    
    const aggregationFiles: any[] = [];
    for (const aggPath of aggregationPaths) {
      if (fs.existsSync(aggPath)) {
        console.log(`Found aggregation file at: ${aggPath}`);
        const data = JSON.parse(fs.readFileSync(aggPath, 'utf-8'));
        aggregationFiles.push(data);
      }
    }
    
    if (aggregationFiles.length === 0) {
      console.error('No aggregation files found, skipping airdrop amount update');
    } else {
      // Update airdrop amounts from aggregation files with transaction
      let totalUpdated = 0;
      
      // Start transaction for updates
      await new Promise<void>((res, rej) => {
        db!.run('BEGIN TRANSACTION', (err) => err ? rej(err) : res());
      });
      
      try {
        const updateStmt = db!.prepare('UPDATE users SET airdrop_amount = ? WHERE wallet_address = ?');
        
        for (const aggData of aggregationFiles) {
          console.log(`Processing ${aggData.name} (${aggData.network})...`);
          
          const entries = aggData.snapshot as [string, number[]][];
          const chunkSize = 500;
          
          for (let i = 0; i < entries.length; i += chunkSize) {
            const chunk = entries.slice(i, i + chunkSize);
            
            for (const [address, amounts] of chunk) {
              await new Promise<void>((resolve) => {
                updateStmt.run([amounts[0], address.toLowerCase()], function(err: any) {
                  if (err) {
                    console.error(`Error updating ${address}:`, err);
                  } else if (this.changes > 0) {
                    totalUpdated++;
                  }
                  resolve();
                });
              });
            }
            
            // Log progress
            if (entries.length > 1000 && i % 1000 === 0) {
              console.log(`  Updated ${i}/${entries.length} airdrop amounts...`);
            }
          }
        }
        
        // Finalize statement
        await new Promise<void>((res) => updateStmt.finalize(() => res()));
        
        // Commit transaction
        await new Promise<void>((res, rej) => {
          db!.run('COMMIT', (err) => err ? rej(err) : res());
        });
      } catch (error) {
        // Rollback on error
        await new Promise<void>((res) => {
          db!.run('ROLLBACK', () => res());
        });
        throw error;
      }
      
      console.log(`✓ Updated airdrop amounts for ${totalUpdated} users from aggregation files`);
    }
    
    console.log('Migration completed successfully!');
    
    // Restore normal database settings
    await new Promise<void>((resolve) => {
      db!.serialize(() => {
        db!.run('PRAGMA synchronous = NORMAL');
        db!.run('PRAGMA journal_mode = WAL', () => resolve());
      });
    });
    
    // Clean up snapshots if in production and migration successful
    if (process.env.NODE_ENV === 'production' && process.env.DELETE_SNAPSHOTS_AFTER_MIGRATION === 'true') {
      console.log('Cleaning up snapshot files...');
      try {
        for (const file of files) {
          fs.unlinkSync(path.join(snapshotsDir, file));
        }
        fs.rmdirSync(snapshotsDir);
        console.log('✓ Snapshot files deleted successfully');
      } catch (cleanupError) {
        console.error('Warning: Could not delete snapshot files:', cleanupError);
      }
    }
    
    // Clear timeout and close database
    clearTimeout(migrationTimeout);
    closeDatabase();
  } catch (error) {
    console.error('Migration failed:', error);
    clearTimeout(migrationTimeout);
    closeDatabase();
  }
};

// Export for API usage
export { migrate };

// Run migration if called directly
if (require.main === module) {
  migrate();
}