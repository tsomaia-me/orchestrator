import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TOOLS } from './tools/index.js';

const app = express();
const PORT = process.env.PORT || 3456;

const server = new McpServer({
  name: 'Relay Daemon',
  version: '3.0.0'
});

// Register all modular tools
TOOLS.forEach((t) => {
  server.tool(t.name, t.description, t.inputSchema.shape, t.handler as any);
});

const transports = new Map<string, SSEServerTransport>();

app.get('/ping', (req, res) => res.status(200).send('pong'));

// Handle multiple incoming IDE connections seamlessly
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  // Store the transport using the SDK-generated session ID
  transports.set(transport.sessionId, transport);

  await server.connect(transport);

  res.on('close', () => {
    transports.delete(transport.sessionId);
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
