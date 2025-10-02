const fs = require('fs');
const path = require('path');
const https = require('https');

const API_HOST = 'claims.lootsurvivor.io';
const SECRET = 'your-secret-key-here';

// Read snapshots directory
const snapshotsDir = path.join(__dirname, '../../../snapshots');
const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'));

console.log(`Found ${files.length} snapshot files to upload`);

// Function to upload a single file
async function uploadFile(fileName) {
  const filePath = path.join(snapshotsDir, fileName);
  const data = fs.readFileSync(filePath, 'utf-8');
  
  const postData = JSON.stringify({
    secret: SECRET,
    fileName: fileName,
    data: data
  });
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: 443,
      path: '/api/upload-snapshot',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✓ Uploaded ${fileName}`);
          resolve();
        } else {
          console.error(`✗ Failed to upload ${fileName}: ${res.statusCode} - ${responseData}`);
          reject(new Error(responseData));
        }
      });
    });
    
    req.on('error', (e) => {
      console.error(`Request error: ${e.message}`);
      reject(e);
    });
    
    req.write(postData);
    req.end();
  });
}

// Upload all files
async function uploadAll() {
  console.log('Starting upload to Railway...\n');
  
  for (const file of files) {
    try {
      await uploadFile(file);
    } catch (error) {
      console.error(`Failed to upload ${file}:`, error.message);
      // Continue with next file
    }
  }
  
  console.log('\nUpload complete!');
  console.log('Now run the migration:');
  console.log('curl -X POST https://claims.lootsurvivor.io/api/migrate \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"secret": "your-secret-key-here"}\'');
}

uploadAll();