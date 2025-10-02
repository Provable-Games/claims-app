const fs = require('fs');
const path = require('path');

console.log('Listing directory structure...\n');
console.log('Current directory:', process.cwd());
console.log('Script directory:', __dirname);

function listDir(dir, prefix = '', maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;
  
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file === 'node_modules' || file === '.git') return;
      
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      console.log(prefix + file + (stats.isDirectory() ? '/' : ''));
      
      if (stats.isDirectory()) {
        listDir(filePath, prefix + '  ', maxDepth, currentDepth + 1);
      }
    });
  } catch (e) {
    console.log(prefix + '[Cannot read directory]');
  }
}

console.log('\n/app structure:');
listDir('/app');

console.log('\n\nLooking specifically for snapshots:');
const checkPaths = [
  '/app',
  '/app/ui',
  '/app/ui/dist',
  '/app/snapshots',
  '/app/ui/snapshots'
];

checkPaths.forEach(p => {
  if (fs.existsSync(p)) {
    try {
      const contents = fs.readdirSync(p);
      const hasSnapshots = contents.includes('snapshots');
      const jsonFiles = contents.filter(f => f.endsWith('.json'));
      console.log(`${p}: ${hasSnapshots ? 'HAS snapshots/' : 'NO snapshots/'} | ${jsonFiles.length} JSON files`);
    } catch (e) {
      console.log(`${p}: [Cannot read]`);
    }
  } else {
    console.log(`${p}: [Does not exist]`);
  }
});