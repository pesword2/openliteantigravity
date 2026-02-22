const http = require('http');
const { URL } = require('url');
const httpProxy = require('http-proxy');

const DEFAULT_TARGET_URL = 'http://localhost:3000';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
]);

function parsePort(rawPort) {
  const parsedPort = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}". Expected an integer between 1 and 65535.`);
  }
  return parsedPort;
}

function resolveTargetUrl(rawTargetUrl) {
  let parsedTarget;
  try {
    parsedTarget = new URL(rawTargetUrl);
  } catch (error) {
    throw new Error(`Invalid TARGET_URL value: "${rawTargetUrl}".`);
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
    throw new Error(
      `Invalid TARGET_URL protocol "${parsedTarget.protocol}". Expected http: or https:.`
    );
  }

  return parsedTarget.toString();
}

function redactHeaders(headers) {
  const safeHeaders = {};

  for (const [name, value] of Object.entries(headers)) {
    safeHeaders[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '[redacted]' : value;
  }

  return safeHeaders;
}

const targetUrl = resolveTargetUrl(process.env.TARGET_URL || DEFAULT_TARGET_URL);
const host = process.env.HOST || DEFAULT_HOST;
const port = parsePort(process.env.PORT || String(DEFAULT_PORT));

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  console.log('Request received:');
  console.log('  Method:', req.method);
  console.log('  URL:', req.url);
  console.log('  Headers:', redactHeaders(req.headers));

  proxy.web(req, res, { target: targetUrl });
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  console.log('Response received:');
  console.log('  Status:', proxyRes.statusCode);
  console.log('  Headers:', redactHeaders(proxyRes.headers));
});

proxy.on('error', (error, req, res) => {
  console.error('Proxy error:', error.message);

  if (res && !res.headersSent) {
    res.writeHead(502);
  }

  if (res && !res.writableEnded) {
    res.end('There was an error proxying the request.');
  }
});

server.on('clientError', (error, socket) => {
  console.error('Client error:', error.message);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.on('error', (error) => {
  console.error('Server error:', error.message);
});

server.listen(port, host, () => {
  console.log(`MITM Proxy server listening on http://${host}:${port}`);
  console.log(`Forwarding traffic to ${targetUrl}`);
});
