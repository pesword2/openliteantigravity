const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '.env') });

// The orchestrator on the VPS is mapped to localhost:4000 via the SSH tunnel
const VPS_ORCHESTRATOR_URL = 'http://localhost:4000';

module.exports = {
    apps: [
        {
            name: 'aei-web',
            script: 'server.js',
            cwd: path.join(__dirname, 'services', 'web'),
            autorestart: true,
            max_restarts: 10,
            env: {
                PORT: '13100',
                ORCHESTRATOR_URL: VPS_ORCHESTRATOR_URL,
            }
        }
    ]
};
