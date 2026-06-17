const rdp = require('@electerm/rdpjs');

console.log('Starting RDP connection test to 10.1.22.14...');

const client = rdp.createClient({
    userName: 'your_username',
    password: 'your_password',
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
client.connect('10.1.22.14', 3389);
