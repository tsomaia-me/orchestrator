import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TOOLS } from './tools/index.js';

const app = express();
const PORT = process.env.PORT || 3456;

function createServer(): McpServer {
  const server = new McpServer({
    name: 'Relay Daemon',
    version: '3.0.0'
  });
  TOOLS.forEach((t) => {
    server.tool(t.name, t.description, t.inputSchema.shape, t.handler as any);
  });
  return server;
}

const transports = new Map<string, SSEServerTransport>();

app.get('/ping', (req, res) => res.status(200).send('pong'));

// One McpServer per SSE connection (MCP spec: 1:1 client-server)
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  const server = createServer();
  await server.connect(transport);
  transports.set(transport.sessionId, transport);

  res.on('close', () => {
    transports.delete(transport.sessionId);
    if (typeof server.close === 'function') {
      server.close().catch(() => {});
    }
  });
});

app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send('Session not found');
  }
});

app.listen(PORT, () => {
  console.log(`Relay Daemon listening on port ${PORT}`);
});
