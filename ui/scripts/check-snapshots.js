const fs = require('fs');
const path = require('path');

console.log('\n=== Checking for snapshots ===');
console.log('Current working directory:', process.cwd());
console.log('Script directory:', __dirname);

// List root directory
console.log('\nContents of /app:');
try {
  const rootFiles = fs.readdirSync('/app');
  rootFiles.forEach(f => {
    const stats = fs.statSync(path.join('/app', f));
    console.log(`  ${f}${stats.isDirectory() ? '/' : ''}`);
  });
  
  // Check if snapshots exists and list its contents
  if (rootFiles.includes('snapshots')) {
    console.log('\nFound /app/snapshots! Contents:');
    const snapshotFiles = fs.readdirSync('/app/snapshots');
    console.log(`  Total files: ${snapshotFiles.length}`);
    const jsonFiles = snapshotFiles.filter(f => f.endsWith('.json'));
    console.log(`  JSON files: ${jsonFiles.length}`);
    if (jsonFiles.length > 0) {
      console.log('  First 5 JSON files:', jsonFiles.slice(0, 5));
    }
  }
} catch (e) {
  console.error('Error reading /app:', e.message);
}

// Also check /app/ui
console.log('\nContents of /app/ui:');
try {
  const uiFiles = fs.readdirSync('/app/ui');
  uiFiles.forEach(f => {
    const stats = fs.statSync(path.join('/app/ui', f));
    console.log(`  ${f}${stats.isDirectory() ? '/' : ''}`);
  });
} catch (e) {
  console.error('Error reading /app/ui:', e.message);
}