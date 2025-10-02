import fs from 'fs';
import path from 'path';

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

// Simple batch migration using provided database connection
export const migrateWithDb = async (db: any): Promise<void> => {
  try {
    console.log('Starting simple migration...');
    
    // Create tables if not exists
    await new Promise<void>((resolve, reject) => {
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
        )`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // Check if migration has already been run
    const alreadyMigrated = await new Promise<boolean>((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM collections`, (err: any, row: any) => {
        if (err || !row) {
          resolve(false);
        } else {
          resolve(row.count > 0);
        }
      });
    });

    if (alreadyMigrated) {
      console.log('Migration already completed. Skipping...');
      return;
    }

    // Find snapshots
    const possiblePaths = [
      path.join(__dirname, '../../../snapshots'),
      path.join(__dirname, '../../snapshots'),
      '/app/snapshots',
      path.join(process.cwd(), 'snapshots'),
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
      console.error('Snapshots directory not found');
      return;
    }
    
    console.log(`Found snapshots at: ${snapshotsDir}`);
    const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} snapshot files`);

    // Process each snapshot file
    for (const file of files) {
      const filePath = path.join(snapshotsDir, file);
      const data: SnapshotData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      console.log(`Processing ${data.name} (${data.snapshot.length} holders)...`);
      
      // Insert collection
      const collectionId = await new Promise<number>((resolve, reject) => {
        db.run(
          `INSERT OR IGNORE INTO collections (name, contract_address, network, description, block_height, chain_id) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [data.name, data.contract_address, data.network, data.description, data.block_height, data.chain_id],
          function(this: any, err: any) {
            if (err) {
              console.error(`Error inserting collection ${data.name}:`, err);
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });

      // Batch insert users and holdings
      const batchSize = 100;
      let processed = 0;
      
      for (let i = 0; i < data.snapshot.length; i += batchSize) {
        const batch = data.snapshot.slice(i, i + batchSize);
        
        // Use a transaction for each batch
        await new Promise<void>((resolve, reject) => {
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            let completed = 0;
            for (const [address, tokenIds] of batch) {
              // Insert user
              db.run(
                `INSERT OR IGNORE INTO users (wallet_address, is_eligible) VALUES (?, ?)`,
                [address.toLowerCase(), 1],
                function(this: any, err: any) {
                  if (err) {
                    console.error(`Error inserting user ${address}:`, err);
                  }
                  
                  // Get user ID and insert holdings
                  db.get(
                    `SELECT id FROM users WHERE wallet_address = ?`,
                    [address.toLowerCase()],
                    (err: any, user: any) => {
                      if (!err && user) {
                        db.run(
                          `INSERT INTO user_holdings (user_id, collection_id, token_ids) VALUES (?, ?, ?)`,
                          [user.id, collectionId, JSON.stringify(tokenIds)],
                          (err: any) => {
                            if (!err) processed++;
                          }
                        );
                      }
                      
                      completed++;
                      if (completed === batch.length) {
                        db.run('COMMIT', (err: Error | null) => {
                          if (err) reject(err);
                          else resolve();
                        });
                      }
                    }
                  );
                }
              );
            }
          });
        });
        
        // Log progress
        if (data.snapshot.length > 1000 && i % 1000 === 0) {
          console.log(`  Processed ${i}/${data.snapshot.length} holders...`);
        }
      }
      
      console.log(`✓ Imported ${processed} holders for ${data.name}`);
    }

    // Import aggregation files for airdrop amounts
    console.log('Importing pre-calculated airdrop amounts...');
    
    const aggregationPaths = [
      path.join(__dirname, '../../../aggregations/processed_rewards_ethereum_aggregated.json'),
      path.join(__dirname, '../../../aggregations/processed_rewards_starknet.json'),
      path.join(process.cwd(), 'aggregations/processed_rewards_ethereum_aggregated.json'),
      path.join(process.cwd(), 'aggregations/processed_rewards_starknet.json'),
      '/app/aggregations/processed_rewards_ethereum_aggregated.json',
      '/app/aggregations/processed_rewards_starknet.json'
    ];
    
    const aggregationFiles: any[] = [];
    const processedFiles = new Set<string>();
    
    for (const aggPath of aggregationPaths) {
      if (fs.existsSync(aggPath)) {
        const fileName = path.basename(aggPath);
        if (!processedFiles.has(fileName)) {
          console.log(`Found aggregation file: ${fileName}`);
          const data = JSON.parse(fs.readFileSync(aggPath, 'utf-8'));
          aggregationFiles.push(data);
          processedFiles.add(fileName);
        }
      }
    }
    
    // Update airdrop amounts in batches
    let totalUpdated = 0;
    for (const aggData of aggregationFiles) {
      console.log(`Processing ${aggData.name} airdrop amounts...`);
      
      const entries = aggData.snapshot as [string, number[]][];
      const updateBatchSize = 500;
      
      for (let i = 0; i < entries.length; i += updateBatchSize) {
        const batch = entries.slice(i, i + updateBatchSize);
        
        await new Promise<void>((resolve) => {
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            let completed = 0;
            for (const [address, amounts] of batch) {
              db.run(
                'UPDATE users SET airdrop_amount = ? WHERE wallet_address = ?',
                [amounts[0], address.toLowerCase()],
                function(this: any, err: any) {
                  if (!err && this.changes > 0) {
                    totalUpdated++;
                  }
                  completed++;
                  if (completed === batch.length) {
                    db.run('COMMIT', () => resolve());
                  }
                }
              );
            }
          });
        });
        
        // Log progress
        if (entries.length > 1000 && i % 1000 === 0) {
          console.log(`  Updated ${i}/${entries.length} airdrop amounts...`);
        }
      }
    }
    
    console.log(`✓ Updated airdrop amounts for ${totalUpdated} users`);
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};