const express = require('express');
const cors = require('cors');
const { db, initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database on startup
initializeDatabase().then(() => {
  console.log('Database initialized successfully');
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});

// Check eligibility endpoint
app.get('/api/eligibility/:walletAddress', (req, res) => {
  const { walletAddress } = req.params;
  
  db.get(
    `SELECT u.*, ua.allocation, ua.claimed, a.name as airdrop_name
     FROM users u
     LEFT JOIN user_airdrops ua ON u.id = ua.user_id
     LEFT JOIN airdrops a ON ua.airdrop_id = a.id
     WHERE u.wallet_address = ?`,
    [walletAddress],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!row) {
        return res.json({ 
          eligible: false, 
          message: 'Wallet address not found in eligibility list' 
        });
      }
      
      res.json({
        eligible: row.is_eligible === 1,
        walletAddress: row.wallet_address,
        allocation: row.allocation || 0,
        claimed: row.claimed === 1,
        airdropName: row.airdrop_name,
        claimedAt: row.claimed_at
      });
    }
  );
});

// Claim airdrop endpoint
app.post('/api/claim', (req, res) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address is required' });
  }
  
  db.serialize(() => {
    db.get(
      'SELECT id FROM users WHERE wallet_address = ? AND is_eligible = 1',
      [walletAddress],
      (err, user) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!user) {
          return res.status(404).json({ error: 'User not eligible or not found' });
        }
        
        // Check if already claimed
        db.get(
          'SELECT claimed FROM user_airdrops WHERE user_id = ?',
          [user.id],
          (err, airdrop) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            
            if (airdrop && airdrop.claimed === 1) {
              return res.status(400).json({ error: 'Airdrop already claimed' });
            }
            
            // Update claim status
            db.run(
              'UPDATE user_airdrops SET claimed = 1, claimed_at = CURRENT_TIMESTAMP WHERE user_id = ?',
              [user.id],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to update claim status' });
                }
                
                res.json({ 
                  success: true, 
                  message: 'Airdrop claimed successfully',
                  claimedAt: new Date().toISOString()
                });
              }
            );
          }
        );
      }
    );
  });
});

// Get all airdrops endpoint
app.get('/api/airdrops', (req, res) => {
  db.all('SELECT * FROM airdrops WHERE is_active = 1', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Add sample data endpoint (for testing)
app.post('/api/seed', (req, res) => {
  db.serialize(() => {
    // Insert sample airdrop
    db.run(
      `INSERT OR IGNORE INTO airdrops (name, description, total_supply, start_date, end_date) 
       VALUES (?, ?, ?, ?, ?)`,
      ['Test Airdrop', 'A test airdrop for demonstration', 1000000, '2024-01-01', '2024-12-31']
    );
    
    // Insert sample users
    const sampleUsers = [
      ['0x1234567890123456789012345678901234567890', 'user1@example.com', 1, 100],
      ['0x2345678901234567890123456789012345678901', 'user2@example.com', 1, 200],
      ['0x3456789012345678901234567890123456789012', 'user3@example.com', 1, 150]
    ];
    
    sampleUsers.forEach(([address, email, eligible, amount]) => {
      db.run(
        `INSERT OR IGNORE INTO users (wallet_address, email, is_eligible, airdrop_amount) 
         VALUES (?, ?, ?, ?)`,
        [address, email, eligible, amount],
        function() {
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});