
// Auto-generated ws proxy wrapper
const path = require("path");
const VENDOR_DIR = path.resolve(__dirname, "../../vendor");
const RealWebSocket = require(path.join(VENDOR_DIR, "baileys-sdk/node_modules/ws/lib/websocket.js"));
const { HttpsProxyAgent } = require("https-proxy-agent");
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "http://127.0.0.1:58309";
const proxyAgent = new HttpsProxyAgent(proxyUrl);

class ProxiedWebSocket extends RealWebSocket {
  constructor(address, protocols, options) {
    const opts = Object.assign({}, options || {}, { agent: proxyAgent });
    super(address, protocols, opts);
  }
}

// Copy static members
for (const key of Object.getOwnPropertyNames(RealWebSocket)) {
  if (key !== 'prototype' && key !== 'length' && key !== 'name') {
    try { ProxiedWebSocket[key] = RealWebSocket[key]; } catch {}
  }
}

module.exports = ProxiedWebSocket;
module.exports.WebSocket = ProxiedWebSocket;
module.exports.default = ProxiedWebSocket;

// Re-export other ws exports
const wsIndex = require(path.join(VENDOR_DIR, "baileys-sdk/node_modules/ws/index.js"));
for (const key of Object.keys(wsIndex)) {
  if (!module.exports[key]) module.exports[key] = wsIndex[key];
}
