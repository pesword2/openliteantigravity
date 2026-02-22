const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const host = process.env.HOST || '0.0.0.0';
const port = parsePort(process.env.PORT || '3000');
const orchestratorBaseUrl = new URL(process.env.ORCHESTRATOR_URL || 'http://orchestrator:4000');
const publicRoot = path.join(__dirname, 'public');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function parsePort(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid PORT value "${raw}". Expected 1-65535.`);
  }
  return value;
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return mimeTypes[extension] || 'application/octet-stream';
}

function sendError(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: message }, null, 2));
}

function proxyApiRequest(req, res, requestPath) {
  const targetUrl = new URL(requestPath, orchestratorBaseUrl);
  const transport = targetUrl.protocol === 'https:' ? https : http;

  const proxyRequest = transport.request(
    targetUrl,
    {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        accept: req.headers.accept || 'application/json',
      },
    },
    (proxyResponse) => {
      res.statusCode = proxyResponse.statusCode || 502;
      for (const [name, value] of Object.entries(proxyResponse.headers)) {
        if (value !== undefined) {
          res.setHeader(name, value);
        }
      }
      proxyResponse.pipe(res);
    }
  );

  proxyRequest.on('error', (error) => {
    sendError(res, 502, `Failed to reach orchestrator: ${error.message}`);
  });

  req.pipe(proxyRequest);
}

function resolveStaticPath(urlPathname) {
  const relativePath = urlPathname === '/' ? '/index.html' : urlPathname;
  const sanitized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  return path.join(publicRoot, sanitized);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    const pathWithoutPrefix = url.pathname.replace('/api', '') + url.search;
    proxyApiRequest(req, res, pathWithoutPrefix);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method not allowed.');
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath.startsWith(publicRoot)) {
    sendError(res, 400, 'Invalid path.');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendError(res, 404, 'Not found.');
        return;
      }
      sendError(res, 500, 'Failed to read static asset.');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(filePath));
    res.end(req.method === 'HEAD' ? undefined : content);
  });
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
  console.log(`Web UI listening on http://${host}:${port}`);
  console.log(`Proxying /api to ${orchestratorBaseUrl.toString()}`);
});
