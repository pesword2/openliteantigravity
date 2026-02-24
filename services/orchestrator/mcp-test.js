const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const http = require('http');

const mcpServer = new McpServer({ name: 'aei-mcp', version: '1.0.0' });
mcpServer.tool('ping', 'Ping the server', { payload: z.string().optional() }, async ({ payload }) => {
    return { content: [{ type: 'text', text: `Pong: ${payload || ''}` }] };
});

const activeTransports = new Map();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/mcp/sse') {
        const transport = new SSEServerTransport('/mcp/messages', res);
        await mcpServer.connect(transport);
        await transport.start(res);
        activeTransports.set(transport.sessionId, transport);

        transport.onclose = () => {
            activeTransports.delete(transport.sessionId);
        };
        return;
    }

    if (url.pathname === '/mcp/messages' && req.method === 'POST') {
        const sessionId = url.searchParams.get('sessionId');
        const transport = activeTransports.get(sessionId);
        if (!transport) {
            res.statusCode = 404;
            res.end('Session not found');
            return;
        }
        await transport.handlePostMessage(req, res);
        return;
    }

    res.statusCode = 404;
    res.end('Not found');
});

server.listen(4444, () => console.log('MCP test listening on 4444'));
