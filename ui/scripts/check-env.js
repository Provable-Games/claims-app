console.log('Environment variables:');
console.log('DATABASE_PATH:', process.env.DATABASE_PATH);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('PWD:', process.env.PWD);
console.log('Current directory:', process.cwd());

const fs = require('fs');
const path = require('path');

// Check if /app/data directory exists
console.log('\nChecking /app/data directory:');
try {
  const stats = fs.statSync('/app/data');
  console.log('/app/data exists:', stats.isDirectory());
} catch (err) {
  console.log('/app/data does not exist');
}

// List files in current directory
console.log('\nFiles in current directory:');
const files = fs.readdirSync('.');
files.forEach(file => {
  const stats = fs.statSync(file);
  console.log(`${file} (${stats.isDirectory() ? 'dir' : 'file'})`);
});

// Check for any .db files
console.log('\nSearching for .db files...');
function findDbFiles(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory() && !filePath.includes('node_modules')) {
          findDbFiles(filePath, fileList);
        } else if (file.endsWith('.db')) {
          fileList.push(filePath);
        }
      } catch (e) {
        // Skip files we can't read
      }
    });
  } catch (e) {
    // Skip directories we can't read
  }
  return fileList;
}

const dbFiles = findDbFiles('.');
if (dbFiles.length > 0) {
  console.log('Found database files:');
  dbFiles.forEach(f => console.log(f));
} else {
  console.log('No .db files found');
}