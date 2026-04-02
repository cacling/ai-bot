/**
 * Baileys Node.js Gateway
 *
 * Runs Baileys in Node.js (not Bun) to avoid Bun's WebSocket 30s disconnect bug.
 * Exposes a tiny HTTP API on BAILEYS_GATEWAY_PORT (default 18031) for the
 * Bun-based channel-host to control connections and send messages.
 *
 * Inbound messages are forwarded to channel-host via HTTP POST.
 */

const http = require('http');
const path = require('path');
const VENDOR_DIR = path.resolve(__dirname, '../../vendor');
const BAILEYS_PATH = path.join(VENDOR_DIR, 'baileys-sdk/node_modules/@whiskeysockets/baileys/lib/index.js');

const PORT = Number(process.env.BAILEYS_GATEWAY_PORT || 18031);
const CHANNEL_HOST_PORT = Number(process.env.CHANNEL_HOST_PORT || 18030);

// Active connections: key = "channelId:accountId"
const connections = new Map();

// ---------------------------------------------------------------------------
// Baileys connection management
// ---------------------------------------------------------------------------

async function startConnection(channelId, accountId, authDir) {
  const key = `${channelId}:${accountId}`;

  // Close existing if any
  const existing = connections.get(key);
  if (existing?.sock) {
    try { existing.sock.end(undefined); } catch {}
  }

  const baileys = require(BAILEYS_PATH);
  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;

  // Proxy
  let agent;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = require(path.join(VENDOR_DIR, 'baileys-sdk/node_modules/https-proxy-agent/dist/index.js'));
      agent = new HttpsProxyAgent(proxyUrl);
      console.log(`[baileys-gw] Using proxy: ${proxyUrl}`);
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[baileys-gw] Starting ${channelId}/${accountId}, version=${version}`);

  const sock = makeWASocket({
    auth: { creds: state.creds, keys: state.keys },
    version,
    printQRInTerminal: false,
    browser: ['channel-host', 'cli', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    ...(agent ? { agent } : {}),
  });

  const conn = {
    channelId, accountId, authDir, sock,
    state: 'connecting',
    messagesReceived: 0, messagesSent: 0,
    connectedAt: null, disconnectedAt: null, error: null,
  };
  connections.set(key, conn);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      conn.qr = qr;
      console.log(`\n[baileys-gw] ========== QR CODE for ${accountId} ==========`);
      try {
        require(path.join(VENDOR_DIR, 'baileys-sdk/node_modules/qrcode-terminal')).generate(qr, { small: true });
      } catch {
        console.log(`[baileys-gw] QR data: ${qr}`);
      }
      console.log(`[baileys-gw] ================================================\n`);
    }

    if (connection === 'open') {
      conn.state = 'connected';
      conn.connectedAt = Date.now();
      conn.error = null;
      conn.qr = null;
      console.log(`[baileys-gw] ✅ ${accountId} connected!`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason?.loggedOut;
      conn.state = 'disconnected';
      conn.disconnectedAt = Date.now();
      conn.error = `Disconnected (status: ${statusCode})`;
      console.log(`[baileys-gw] ❌ ${accountId} disconnected (status: ${statusCode})`);

      if (shouldReconnect) {
        console.log(`[baileys-gw] Reconnecting ${accountId} in 5s...`);
        setTimeout(() => {
          startConnection(channelId, accountId, authDir).catch(console.error);
        }, 5000);
      }
    }
  });

  // Forward inbound messages to channel-host
  sock.ev.on('messages.upsert', (upsert) => {
    console.log(`[baileys-gw] messages.upsert: ${upsert.messages.length} messages, type=${upsert.type}`);
    for (const msg of upsert.messages) {
      const msgKey = msg.key;
      const _dbg = msg.message;
      const _dbgText = _dbg?.conversation ?? _dbg?.extendedTextMessage?.text ?? '';
      console.log(`[baileys-gw]   msg: fromMe=${msgKey?.fromMe}, jid=${msgKey?.remoteJid}, participant=${msgKey?.participant}, pushName=${msg.pushName}, text="${_dbgText}", keys=${_dbg ? Object.keys(_dbg).join(',') : 'null'}`);
      if (msgKey?.remoteJid === 'status@broadcast') continue;
      // Skip reaction-only messages (check actual key existence, not prototype)
      if (msg.message && Object.prototype.hasOwnProperty.call(msg.message, 'reactionMessage')) continue;

      const message = msg.message;
      const text =
        message?.conversation ??
        message?.extendedTextMessage?.text ??
        '';

      console.log(`[baileys-gw]   text="${text}", fromMe=${msgKey?.fromMe}`);

      if (!text && !message?.imageMessage && !message?.videoMessage && !message?.documentMessage && !message?.audioMessage) continue;

      // Baileys LID mode incorrectly sets fromMe=true for incoming messages.
      // Use JID comparison: if remoteJid contains our own number, it's truly from us.
      const myNumber = state.creds?.me?.id?.split(':')[0] || state.creds?.me?.id?.split('@')[0] || '';
      const senderJid = msgKey?.remoteJid ?? '';
      const isReallyFromMe = senderJid.includes(myNumber) && myNumber.length > 5;
      // Also skip type=append (our own sent messages echoed back)
      const isEcho = upsert.type === 'append';
      if (isReallyFromMe || isEcho) continue;

      const remoteJid = msgKey?.remoteJid ?? '';
      const senderId = msgKey?.participant ?? remoteJid;
      const pushName = msg.pushName ?? '';

      conn.messagesReceived++;

      const envelope = {
        channelId: 'whatsapp',
        channelAccountId: accountId,
        threadId: remoteJid,
        senderId,
        text: text || undefined,
        media: message?.imageMessage ? {
          type: 'image',
          caption: message.imageMessage?.caption,
        } : message?.documentMessage ? {
          type: 'document',
          fileName: message.documentMessage?.fileName,
        } : undefined,
        metadata: {
          pushName,
          chatType: remoteJid.endsWith('@g.us') ? 'group' : 'direct',
          fromMe: msgKey?.fromMe,
          messageId: msgKey?.id,
        },
        timestamp: msg.messageTimestamp
          ? Number(msg.messageTimestamp) * 1000
          : Date.now(),
      };

      // Forward to channel-host inbound bridge
      forwardToChannelHost(envelope);
    }
  });

  return { success: true };
}

function forwardToChannelHost(envelope) {
  const data = JSON.stringify(envelope);
  const req = http.request({
    hostname: '127.0.0.1',
    port: CHANNEL_HOST_PORT,
    path: '/webhooks/baileys-gateway',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  }, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
      if (res.statusCode !== 200) console.error(`[baileys-gw] Forward failed: ${res.statusCode} ${body}`);
    });
  });
  req.on('error', (e) => console.error('[baileys-gw] Forward error:', e.message));
  req.write(data);
  req.end();
}

async function stopConnection(channelId, accountId) {
  const key = `${channelId}:${accountId}`;
  const conn = connections.get(key);
  if (!conn) return { success: false, error: 'No connection found' };
  try {
    if (conn.sock) conn.sock.end(undefined);
    conn.state = 'disconnected';
    conn.disconnectedAt = Date.now();
    connections.delete(key);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function sendMessage(channelId, accountId, to, text) {
  const key = `${channelId}:${accountId}`;
  const conn = connections.get(key);
  if (!conn || conn.state !== 'connected') {
    return { success: false, error: 'Not connected' };
  }
  try {
    const result = await conn.sock.sendMessage(to, { text });
    conn.messagesSent++;
    return { success: true, messageId: result?.key?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function getStatus(channelId, accountId) {
  const key = `${channelId}:${accountId}`;
  const conn = connections.get(key);
  if (!conn) return null;
  return {
    channelId: conn.channelId,
    accountId: conn.accountId,
    state: conn.state,
    error: conn.error,
    connectedAt: conn.connectedAt,
    disconnectedAt: conn.disconnectedAt,
    messagesReceived: conn.messagesReceived,
    messagesSent: conn.messagesSent,
    hasQr: !!conn.qr,
  };
}

function listStatuses() {
  return Array.from(connections.values()).map(c => getStatus(c.channelId, c.accountId));
}

// ---------------------------------------------------------------------------
// HTTP API
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
    // Health
    if (path === '/health') {
      return respond({ status: 'ok', service: 'baileys-gateway', connections: connections.size });
    }

    // Start connection
    if (req.method === 'POST' && path === '/start') {
      const body = await parseBody(req);
      const { channelId, accountId, authDir } = body;
      if (!channelId || !accountId || !authDir) return respond({ error: 'Missing params' }, 400);
      const result = await startConnection(channelId, accountId, authDir);
      return respond(result);
    }

    // Stop connection
    if (req.method === 'POST' && path === '/stop') {
      const body = await parseBody(req);
      const result = await stopConnection(body.channelId, body.accountId);
      return respond(result);
    }

    // Send message
    if (req.method === 'POST' && path === '/send') {
      const body = await parseBody(req);
      const result = await sendMessage(body.channelId, body.accountId, body.to, body.text);
      return respond(result);
    }

    // Get status
    if (req.method === 'GET' && path.startsWith('/status/')) {
      const parts = path.split('/').filter(Boolean); // ['status', channelId, accountId]
      const status = getStatus(parts[1], parts[2]);
      return status ? respond(status) : respond({ error: 'Not found' }, 404);
    }

    // List all
    if (req.method === 'GET' && path === '/connections') {
      return respond(listStatuses());
    }

    respond({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('[baileys-gw] HTTP error:', err);
    respond({ error: String(err) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[baileys-gw] Gateway listening on port ${PORT}`);
});
