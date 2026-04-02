/**
 * Feishu Node.js Gateway
 *
 * Uses @larksuiteoapi/node-sdk WSClient for long-connection event subscription.
 * No public URL needed — Feishu pushes events via WebSocket.
 *
 * Inbound messages are forwarded to channel-host via HTTP POST.
 * Replies are sent via Feishu Open API (through the SDK client).
 *
 * Env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_VERIFICATION_TOKEN
 */

const http = require('http');
const path = require('path');
const VENDOR_DIR = path.resolve(__dirname, '../../vendor');
const LARK_SDK_PATH = path.join(VENDOR_DIR, 'feishu-sdk/node_modules/@larksuiteoapi/node-sdk');

const PORT = Number(process.env.FEISHU_GATEWAY_PORT || 18032);
const CHANNEL_HOST_PORT = Number(process.env.CHANNEL_HOST_PORT || 18030);

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
  console.error('[feishu-gw] FEISHU_APP_ID and FEISHU_APP_SECRET are required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load Feishu SDK + Proxy Support
// ---------------------------------------------------------------------------

const Lark = require(LARK_SDK_PATH);

const baseConfig = {
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
};

// Proxy support: SDK uses axios for HTTP + ws for WebSocket — both need proxy agent
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
let proxyAgent = undefined;
if (proxyUrl) {
  try {
    const { HttpsProxyAgent } = require(path.join(VENDOR_DIR, 'feishu-sdk/node_modules/https-proxy-agent/dist/index.js'));
    proxyAgent = new HttpsProxyAgent(proxyUrl);
    console.log(`[feishu-gw] Using proxy: ${proxyUrl}`);
  } catch (e) {
    console.warn(`[feishu-gw] Failed to load https-proxy-agent: ${e.message}`);
  }
}

// Create axios instance with proxy for SDK HTTP calls (tenant token, config fetch)
let httpInstance = undefined;
if (proxyAgent) {
  const axios = require(path.join(VENDOR_DIR, 'feishu-sdk/node_modules/axios/dist/node/axios.cjs'));
  httpInstance = axios.create({ httpsAgent: proxyAgent, proxy: false });
  // Match SDK's default interceptors
  httpInstance.interceptors.request.use((req) => {
    if (req.headers) req.headers['User-Agent'] = 'oapi-node-sdk/1.0.0';
    return req;
  }, undefined, { synchronous: true });
  httpInstance.interceptors.response.use((resp) => {
    if (resp.config['$return_headers']) {
      return { data: resp.data, headers: resp.headers };
    }
    return resp.data;
  });
}

const client = new Lark.Client({
  ...baseConfig,
  ...(httpInstance ? { httpInstance } : {}),
});
const wsClient = new Lark.WSClient({
  ...baseConfig,
  loggerLevel: Lark.LoggerLevel.info,
  ...(proxyAgent ? { agent: proxyAgent } : {}),
  ...(httpInstance ? { httpInstance } : {}),
});

// Track connection state
let connectionState = 'disconnected';
let messagesReceived = 0;
let messagesSent = 0;
let connectedAt = null;

// ---------------------------------------------------------------------------
// Forward inbound messages to channel-host
// (Agent call + phone resolution is handled by channel-host inbound-bridge via CDP)
// ---------------------------------------------------------------------------

function forwardToChannelHost(envelope) {
  const data = JSON.stringify(envelope);
  const req = http.request({
    hostname: '127.0.0.1',
    port: CHANNEL_HOST_PORT,
    path: '/webhooks/feishu',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  }, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`[feishu-gw] Forward failed: ${res.statusCode} ${body}`);
      }
    });
  });
  req.on('error', (e) => console.error('[feishu-gw] Forward error:', e.message));
  req.write(data);
  req.end();
}

// ---------------------------------------------------------------------------
// Start WebSocket long connection
// ---------------------------------------------------------------------------

console.log(`[feishu-gw] Starting WSClient for app ${FEISHU_APP_ID}...`);

wsClient.start({
  eventDispatcher: new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      connectionState = 'connected';
      if (!connectedAt) connectedAt = Date.now();

      const message = data.message || {};
      const sender = data.sender || {};

      const chatId = message.chat_id || '';
      const chatType = message.chat_type || 'p2p';
      const messageId = message.message_id || '';
      const messageType = message.message_type || 'text';
      const senderId = (sender.sender_id && sender.sender_id.open_id) || '';

      // Parse content
      let text = '';
      try {
        const content = JSON.parse(message.content || '{}');
        text = content.text || '';
      } catch {
        text = message.content || '';
      }

      // Remove @bot mentions (format: @_user_1 in Feishu)
      text = text.replace(/@_user_\d+\s*/g, '').trim();

      console.log(`[feishu-gw] Message: chatType=${chatType}, from=${senderId}, text="${text.slice(0, 50)}"`);

      if (!text) {
        console.log('[feishu-gw] Empty text, skipping');
        return;
      }

      messagesReceived++;

      // Forward to channel-host inbound bridge
      // (agent call + phone resolution + reply all handled by inbound-bridge via CDP)
      const envelope = {
        schema: '2.0',
        header: {
          event_id: `feishu-gw-${messageId}-${Date.now()}`,
          event_type: 'im.message.receive_v1',
          create_time: String(Date.now()),
          token: process.env.FEISHU_VERIFICATION_TOKEN || '',
          app_id: FEISHU_APP_ID,
          tenant_key: 'default',
        },
        event: data,
      };
      forwardToChannelHost(envelope);
    },
  }),
});

console.log('[feishu-gw] WSClient started, waiting for events...');
connectionState = 'connecting';

// ---------------------------------------------------------------------------
// HTTP API (status & control)
// ---------------------------------------------------------------------------

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const respond = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    if (path === '/health') {
      return respond({
        status: 'ok',
        service: 'feishu-gateway',
        connectionState,
        messagesReceived,
        messagesSent,
        connectedAt,
      });
    }

    // Send message via Feishu API
    if (req.method === 'POST' && path === '/send') {
      const body = await parseBody(req);
      const { chatId, text } = body;
      if (!chatId || !text) return respond({ error: 'Missing chatId or text' }, 400);

      try {
        const result = await client.im.v1.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text }),
          },
        });

        if (result.code === 0) {
          messagesSent++;
          return respond({ success: true, messageId: result.data?.message_id });
        } else {
          return respond({ success: false, error: result.msg });
        }
      } catch (err) {
        return respond({ success: false, error: String(err) });
      }
    }

    respond({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('[feishu-gw] HTTP error:', err);
    respond({ error: String(err) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[feishu-gw] HTTP API listening on port ${PORT}`);
});
