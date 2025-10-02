// Special migration script for Railway that handles remote DATABASE_PATH
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// For Railway, we need to use SSH or the web API to run migration
console.log('Railway migration helper');
console.log('DATABASE_PATH:', process.env.DATABASE_PATH);

if (process.env.DATABASE_PATH && process.env.DATABASE_PATH.startsWith('/app/')) {
  console.log('\nTo run migration on Railway with local snapshots:');
  console.log('1. The snapshots must be deployed to Railway (not in .gitignore)');
  console.log('2. OR use the web API endpoint we created');
  console.log('\nSince snapshots are in .gitignore, use the web API:');
  console.log('curl -X POST https://claims.lootsurvivor.io/api/migrate \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"secret": "your-secret-key-here"}\'');
  
  console.log('\nAlternatively, you can:');
  console.log('1. SSH into Railway container: railway run bash');
  console.log('2. Copy snapshots manually');
  console.log('3. Run migration inside container');
} else {
  console.log('Running migration with local database...');
  require('./migrate-snapshots-sequential');
}