const rdp = require('@electerm/rdpjs');

console.log('Starting RDP connection test to YOUR_RDP_SERVER_IP...');

const client = rdp.createClient({
    userName: 'YOUR_RDP_USERNAME',
    password: 'YOUR_RDP_PASSWORD',
    domain: '',
    enablePerf: true,
    autoLogin: true,
    screen: { width: 1024, height: 768 },
    locale: 'en',
    logLevel: 'DEBUG'
});

client.on('connect', () => {
    console.log('SUCCESS: Connected to RDP server!');
    process.exit(0);
});

client.on('error', (err) => {
    console.error('ERROR: RDP error encountered:', err);
    process.exit(1);
});

client.on('close', () => {
    console.log('CLOSE: Connection closed');
    process.exit(0);
});

console.log('Connecting...');
client.connect('YOUR_RDP_SERVER_IP', 3389);
