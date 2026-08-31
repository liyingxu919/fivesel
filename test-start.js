console.log('Test script starting...');
console.log('Node version:', process.version);
console.log('Current dir:', process.cwd());
console.log('Files in current dir:', require('fs').readdirSync('.'));
console.log('Test script done.');
process.exit(0);
