const fs = require('fs');
const path = require('path');

console.log('Current directory:', __dirname);
console.log('Process cwd:', process.cwd());

// Function to recursively find directories named 'snapshots'
function findSnapshotsDir(startPath, level = 0) {
  if (level > 5) return; // Limit recursion depth
  
  try {
    const files = fs.readdirSync(startPath);
    files.forEach(file => {
      const filePath = path.join(startPath, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          if (file === 'snapshots') {
            console.log('Found snapshots directory at:', filePath);
            // Check contents
            const snapshotFiles = fs.readdirSync(filePath);
            console.log(`  Contains ${snapshotFiles.length} files`);
            if (snapshotFiles.length > 0) {
              console.log('  First few files:', snapshotFiles.slice(0, 5));
            }
          }
          // Don't recurse into node_modules
          if (file !== 'node_modules' && file !== '.git') {
            findSnapshotsDir(filePath, level + 1);
          }
        }
      } catch (e) {
        // Skip files we can't read
      }
    });
  } catch (e) {
    console.error('Error reading directory:', startPath);
  }
}

console.log('\nSearching for snapshots directories...');
findSnapshotsDir('/app');

// Also check some specific paths
const checkPaths = [
  '/app/snapshots',
  '/app/ui/snapshots',
  '/app/ui/dist/snapshots',
  path.join(__dirname, '../../snapshots'),
  path.join(__dirname, '../../../snapshots'),
  path.join(process.cwd(), 'snapshots'),
  path.join(process.cwd(), 'ui/snapshots')
];

console.log('\nChecking specific paths:');
checkPaths.forEach(p => {
  console.log(`${p}: ${fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND'}`);
});