import { db } from './database';

// Create indices for high-performance queries
export const createIndices = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    console.log('Creating database indices for performance...');
    
    db.serialize(() => {
      // Primary query: eligibility check by wallet address
      // The query looks for wallet_address in two formats (original and normalized)
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_wallet_address 
              ON users(wallet_address)`, 
        (err) => {
          if (err) console.error('Error creating wallet_address index:', err);
          else console.log('✓ Created index on users.wallet_address');
        }
      );

      // Index for eligible users only (filter out non-eligible)
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_eligible 
              ON users(is_eligible, wallet_address)`, 
        (err) => {
          if (err) console.error('Error creating eligibility index:', err);
          else console.log('✓ Created composite index on users(is_eligible, wallet_address)');
        }
      );

      // Index for user_airdrops junction table
      db.run(`CREATE INDEX IF NOT EXISTS idx_user_airdrops_user_id 
              ON user_airdrops(user_id)`,
        (err) => {
          if (err) console.error('Error creating user_airdrops index:', err);
          else console.log('✓ Created index on user_airdrops.user_id');
        }
      );

      // Index for claimed status queries
      db.run(`CREATE INDEX IF NOT EXISTS idx_user_airdrops_claimed 
              ON user_airdrops(user_id, claimed)`,
        (err) => {
          if (err) console.error('Error creating claimed index:', err);
          else console.log('✓ Created composite index on user_airdrops(user_id, claimed)');
        }
      );

      // Index for active airdrops
      db.run(`CREATE INDEX IF NOT EXISTS idx_airdrops_active 
              ON airdrops(is_active)`,
        (err) => {
          if (err) console.error('Error creating airdrops index:', err);
          else console.log('✓ Created index on airdrops.is_active');
        }
      );

      // Analyze tables to update query planner statistics
      db.run('ANALYZE', (err) => {
        if (err) {
          console.error('Error analyzing database:', err);
          reject(err);
        } else {
          console.log('✓ Database analysis complete');
          resolve();
        }
      });
    });
  });
};

// Function to check existing indices
export const checkIndices = (): Promise<void> => {
  return new Promise((resolve) => {
    db.all(`SELECT name, tbl_name, sql 
            FROM sqlite_master 
            WHERE type = 'index' 
            AND name NOT LIKE 'sqlite_%'
            ORDER BY tbl_name, name`, 
      (err, rows) => {
        if (err) {
          console.error('Error checking indices:', err);
        } else {
          console.log('\nExisting indices:');
          rows.forEach((row: any) => {
            console.log(`- ${row.name} on ${row.tbl_name}`);
          });
        }
        resolve();
      }
    );
  });
};