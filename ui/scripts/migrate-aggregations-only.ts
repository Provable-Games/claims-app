import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const sqlite = sqlite3.verbose();

// Use DATABASE_PATH env var if available (for Railway), otherwise use local path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../server/airdrop.db');
const dbDir = path.dirname(dbPath);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log('Using database at:', dbPath);
const db = new sqlite.Database(dbPath);

// Main migration function for aggregations only
const migrateAggregations = async () => {
  try {
    console.log('Starting aggregations-only migration...');
    
    // Load aggregation files
    const aggregationPaths = [
      path.join(__dirname, '../../aggregations/processed_rewards_ethereum_aggregated.json'),
      path.join(__dirname, '../../aggregations/processed_rewards_starknet.json'),
      path.join(process.cwd(), 'aggregations/processed_rewards_ethereum_aggregated.json'),
      path.join(process.cwd(), 'aggregations/processed_rewards_starknet.json'),
      '/app/aggregations/processed_rewards_ethereum_aggregated.json',
      '/app/aggregations/processed_rewards_starknet.json'
    ];
    
    const aggregationFiles: any[] = [];
    const processedFiles = new Set<string>();
    
    for (const aggPath of aggregationPaths) {
      if (fs.existsSync(aggPath)) {
        const resolvedPath = fs.realpathSync(aggPath);
        const fileName = path.basename(aggPath);
        
        // Skip if we've already processed this file
        if (processedFiles.has(fileName)) {
          continue;
        }
        
        console.log(`Found aggregation file: ${fileName} at ${aggPath}`);
        const data = JSON.parse(fs.readFileSync(aggPath, 'utf-8'));
        aggregationFiles.push(data);
        processedFiles.add(fileName);
      }
    }
    
    if (aggregationFiles.length === 0) {
      console.error('No aggregation files found!');
      db.close();
      return;
    }
    
    // Create/insert users from aggregation files
    let totalProcessed = 0;
    for (const aggData of aggregationFiles) {
      console.log(`Processing ${aggData.name} (${aggData.network})...`);
      
      for (const [address, amounts] of aggData.snapshot) {
        await new Promise<void>((resolve) => {
          db.run(
            'INSERT OR REPLACE INTO users (wallet_address, is_eligible, airdrop_amount) VALUES (?, ?, ?)',
            [address.toLowerCase(), 1, amounts[0]],
            function(err: any) {
              if (err) {
                console.error(`Error inserting ${address}:`, err);
              } else {
                totalProcessed++;
              }
              resolve();
            }
          );
        });
      }
    }
    
    console.log(`✓ Processed ${totalProcessed} users from aggregation files`);
    console.log('Migration completed successfully!');
    
    db.close();
  } catch (error) {
    console.error('Migration failed:', error);
    db.close();
  }
};

// Export for API usage
export { migrateAggregations };

// Run migration if called directly
if (require.main === module) {
  migrateAggregations();
}