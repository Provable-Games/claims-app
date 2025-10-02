import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { db, initializeDatabase } from './database';
import { User, Airdrop, UserAirdrop, EligibilityResponse, ClaimRequest, ClaimResponse, ApiError, EligibilityReason } from '../airdrop-app/src/types';
import { rateLimiter, sanitizeWalletAddress } from './middleware/security';

const app = express();
const PORT: number = parseInt(process.env.PORT || '3001');

// Global migration lock
let migrationInProgress = false;

// Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});
app.use(cors());
app.use(express.json());

// Static files will be served after API routes are defined

// Initialize database and create indices on startup
initializeDatabase().then(async () => {
  console.log('Database initialized successfully');
  
  // Create performance indices
  try {
    const { createIndices } = await import('./database-indices');
    await createIndices();
  } catch (err) {
    console.error('Failed to create indices:', err);
  }
}).catch((err: Error) => {
  console.error('Failed to initialize database:', err);
});

// Types for database rows
interface DatabaseUser {
  id: number;
  wallet_address: string;
  email?: string;
  is_eligible: number; // SQLite uses 0/1 for boolean
  airdrop_amount: number;
  has_claimed: number;
  claimed_at?: string;
  created_at: string;
  allocation?: number;
  claimed?: number;
  airdrop_name?: string;
}

// Helper function to normalize addresses (remove leading zeros after 0x)
const normalizeAddress = (address: string): string => {
  if (!address || !address.startsWith('0x')) return address;
  // Remove leading zeros after 0x prefix, but keep at least one character
  const hexPart = address.slice(2).replace(/^0+/, '') || '0';
  return '0x' + hexPart;
};

// Check eligibility endpoint with rate limiting and validation
app.get('/api/eligibility/:walletAddress', rateLimiter(20, 60000), sanitizeWalletAddress, (req: Request, res: Response, next: NextFunction) => {
  console.log('Eligibility check for address:', req.params.walletAddress, 'Length:', req.params.walletAddress.length);
  next();
}, (req: Request, res: Response) => {
  const { walletAddress } = req.params;
  const normalizedAddress = normalizeAddress(walletAddress.toLowerCase());
  console.log('Normalized address:', normalizedAddress);
  
  db.get(
    `SELECT u.*, ua.allocation, ua.claimed, a.name as airdrop_name
     FROM users u
     LEFT JOIN user_airdrops ua ON u.id = ua.user_id
     LEFT JOIN airdrops a ON ua.airdrop_id = a.id
     WHERE u.wallet_address = ? OR u.wallet_address = ?`,
    [walletAddress.toLowerCase(), normalizedAddress],
    (err: Error | null, row: DatabaseUser) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' } as ApiError);
      }
      
      if (!row) {
        return res.json({ 
          eligible: false, 
          message: 'Wallet address not found in eligibility list' 
        } as EligibilityResponse);
      }

      // Get collection holdings for the user
      db.all(
        `SELECT c.name as collection, c.network, uh.token_ids
         FROM user_holdings uh
         JOIN collections c ON uh.collection_id = c.id
         WHERE uh.user_id = ?`,
        [row.id],
        (holdingsErr: Error | null, holdings: any[]) => {
          if (holdingsErr) {
            console.error('Error fetching holdings:', holdingsErr);
          }

          const reasons: EligibilityReason[] = holdings ? holdings.map(h => ({
            collection: h.collection,
            network: h.network,
            tokenCount: JSON.parse(h.token_ids || '[]').length
          })) : [];

          res.json({
            eligible: row.is_eligible === 1,
            walletAddress: row.wallet_address,
            allocation: row.allocation || row.airdrop_amount || 0,
            claimed: row.claimed === 1,
            airdropName: row.airdrop_name,
            claimedAt: row.claimed_at,
            reasons
          } as EligibilityResponse);
        }
      );
    }
  );
});

// Claim airdrop endpoint with rate limiting and validation
app.post('/api/claim', rateLimiter(5, 60000), sanitizeWalletAddress, (req: Request<{}, ClaimResponse | ApiError, ClaimRequest>, res: Response<ClaimResponse | ApiError>) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address is required' } as ApiError);
  }
  
  const normalizedAddress = normalizeAddress(walletAddress.toLowerCase());
  
  db.serialize(() => {
    db.get(
      'SELECT id FROM users WHERE (wallet_address = ? OR wallet_address = ?) AND is_eligible = 1',
      [walletAddress.toLowerCase(), normalizedAddress],
      (err: Error | null, user: { id: number } | undefined) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' } as ApiError);
        }
        
        if (!user) {
          return res.status(404).json({ error: 'User not eligible or not found' } as ApiError);
        }
        
        // Check if already claimed
        db.get(
          'SELECT claimed FROM user_airdrops WHERE user_id = ?',
          [user.id],
          (err: Error | null, airdrop: { claimed: number } | undefined) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' } as ApiError);
            }
            
            if (airdrop && airdrop.claimed === 1) {
              return res.status(400).json({ error: 'Airdrop already claimed' } as ApiError);
            }
            
            // Update claim status
            db.run(
              'UPDATE user_airdrops SET claimed = 1, claimed_at = CURRENT_TIMESTAMP WHERE user_id = ?',
              [user.id],
              function(err: Error | null) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to update claim status' } as ApiError);
                }
                
                res.json({ 
                  success: true, 
                  message: 'Airdrop claimed successfully',
                  claimedAt: new Date().toISOString()
                } as ClaimResponse);
              }
            );
          }
        );
      }
    );
  });
});

// Get all airdrops endpoint
app.get('/api/airdrops', (req: Request, res: Response<Airdrop[] | ApiError>) => {
  // Limit results to prevent large data dumps
  db.all('SELECT * FROM airdrops WHERE is_active = 1 LIMIT 100', (err: Error | null, rows: Airdrop[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' } as ApiError);
    }
    res.json(rows);
  });
});


// Migration endpoint (protected with secret key)
app.post('/api/migrate', async (req: Request, res: Response) => {
  const { secret } = req.body;
  
  // Simple protection - you should set this as an environment variable
  const MIGRATION_SECRET = process.env.MIGRATION_SECRET;
  
  if (!MIGRATION_SECRET) {
    return res.status(500).json({ error: 'Migration secret not configured' });
  }
  
  if (secret !== MIGRATION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Check if migration is already in progress
  if (migrationInProgress) {
    return res.status(409).json({ error: 'Migration already in progress' });
  }
  
  try {
    migrationInProgress = true;
    
    // Set environment variable to delete snapshots after migration
    process.env.DELETE_SNAPSHOTS_AFTER_MIGRATION = 'true';
    
    // Import and run migration with server's db connection
    const { migrateWithDb } = await import('../scripts/migrate-snapshots-simple');
    console.log('Starting migration from API endpoint...');
    
    // Run migration and track completion
    res.json({ 
      message: 'Migration started. Check server logs for progress.',
      note: 'This may take several minutes to complete.'
    });
    
    // Run migration after response is sent
    migrateWithDb(db).then(() => {
      console.log('Migration completed successfully via API endpoint');
      migrationInProgress = false;
    }).catch((err) => {
      console.error('Migration failed via API endpoint:', err);
      migrationInProgress = false;
    });
  } catch (error) {
    console.error('Error starting migration:', error);
    migrationInProgress = false;
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Aggregations-only migration endpoint
app.post('/api/migrate-aggregations', async (req: Request, res: Response) => {
  const { secret } = req.body;
  
  const MIGRATION_SECRET = process.env.MIGRATION_SECRET;
  
  if (!MIGRATION_SECRET) {
    return res.status(500).json({ error: 'Migration secret not configured' });
  }
  if (secret !== MIGRATION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { migrateAggregations } = await import('../scripts/migrate-aggregations-only');
    console.log('Starting aggregations-only migration...');
    
    res.json({ 
      message: 'Aggregations migration started.',
      note: 'This should complete quickly.'
    });
    
    migrateAggregations().then(() => {
      console.log('Aggregations migration completed successfully');
    }).catch((err) => {
      console.error('Aggregations migration failed:', err);
    });
  } catch (error) {
    console.error('Error starting aggregations migration:', error);
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Reset migration endpoint  
app.post('/api/reset-migration', async (req: Request, res: Response) => {
  const { secret } = req.body;
  
  const MIGRATION_SECRET = process.env.MIGRATION_SECRET;
  
  if (!MIGRATION_SECRET) {
    return res.status(500).json({ error: 'Migration secret not configured' });
  }
  if (secret !== MIGRATION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('Resetting migration status...');
  
  db.serialize(() => {
    db.run('DROP TABLE IF EXISTS collections', (err) => {
      if (err) console.error('Error dropping collections:', err);
    });
    
    db.run('DROP TABLE IF EXISTS user_holdings', (err) => {
      if (err) console.error('Error dropping user_holdings:', err);
    });
    
    db.run('DELETE FROM users', (err) => {
      if (err) {
        console.error('Error clearing users:', err);
        res.status(500).json({ error: 'Failed to reset migration' });
      } else {
        console.log('Migration reset complete');
        res.json({ success: true, message: 'Migration reset complete' });
      }
    });
  });
});

// Add sample data endpoint (for testing)
app.post('/api/seed', (req: Request, res: Response) => {
  db.serialize(() => {
    // Insert sample airdrop
    db.run(
      `INSERT OR IGNORE INTO airdrops (name, description, total_supply, start_date, end_date) 
       VALUES (?, ?, ?, ?, ?)`,
      ['Test Airdrop', 'A test airdrop for demonstration', 1000000, '2024-01-01', '2024-12-31']
    );
    
    // Insert sample users
    const sampleUsers: [string, string, number, number][] = [
      ['0x1234567890123456789012345678901234567890', 'user1@example.com', 1, 100],
      ['0x2345678901234567890123456789012345678901', 'user2@example.com', 1, 200],
      ['0x3456789012345678901234567890123456789012', 'user3@example.com', 1, 150]
    ];
    
    sampleUsers.forEach(([address, email, eligible, amount]) => {
      db.run(
        `INSERT OR IGNORE INTO users (wallet_address, email, is_eligible, airdrop_amount) 
         VALUES (?, ?, ?, ?)`,
        [address, email, eligible, amount],
        function(this: any) {
          if (this.lastID) {
            db.run(
              `INSERT OR IGNORE INTO user_airdrops (user_id, airdrop_id, allocation) 
               VALUES (?, 1, ?)`,
              [this.lastID, amount]
            );
          }
        }
      );
    });
  });
  
  res.json({ message: 'Sample data seeded successfully' });
});

// Database status endpoint
app.get('/api/db-status', (req: Request, res: Response) => {
  db.serialize(() => {
    const status: any = {};
    
    // Check user count
    db.get('SELECT COUNT(*) as count FROM users', (err: any, row: any) => {
      status.userCount = err ? 'Error' : row.count;
      
      // Check collections count
      db.get('SELECT COUNT(*) as count FROM collections', (err: any, row: any) => {
        status.collectionsCount = err ? 'Error' : row.count;
        
        // Check if any migration is in progress
        db.get('SELECT COUNT(*) as count FROM users WHERE airdrop_amount > 0', (err: any, row: any) => {
          status.usersWithAirdropAmount = err ? 'Error' : row.count;
          
          res.json({
            databasePath: process.env.DATABASE_PATH || 'local',
            ...status,
            migrationLikelyComplete: status.collectionsCount > 0,
            migrationInProgress: migrationInProgress
          });
        });
      });
    });
  });
});

// Health check endpoint (must be before catch-all)
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Debug endpoint to find snapshots
app.get('/api/debug/find-snapshots', (req: Request, res: Response) => {
  const findSnapshots = require('../scripts/find-snapshots');
  res.json({ message: 'Check server logs for snapshot locations' });
});

// Debug endpoint to check snapshots
app.get('/api/debug/check-snapshots', (req: Request, res: Response) => {
  try {
    require('../scripts/check-snapshots');
    res.json({ message: 'Check server logs for snapshot info' });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Failed to run debug script' });
  }
});

// Serve static files from the React app
const staticPath = path.join(__dirname, '../../airdrop-app/dist');
app.use(express.static(staticPath));
console.log('Serving static files from:', staticPath);

// Catch-all route to serve React app (only for non-API and non-asset routes)
app.get('*', (req: Request, res: Response) => {
  // Don't catch requests for assets
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, '../../airdrop-app/dist/index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Build timestamp: ${new Date().toISOString()}`);
  console.log('API routes registered before static middleware: YES');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});