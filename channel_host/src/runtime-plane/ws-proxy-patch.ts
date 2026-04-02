/**
 * WebSocket Proxy Patch
 *
 * Wraps Baileys' makeWASocket to automatically inject an HTTPS proxy agent
 * when HTTPS_PROXY / HTTP_PROXY is set.
 *
 * Approach: After the real Baileys module loads, we monkey-patch the
 * makeWASocket export to add the proxy agent to its config.
 *
 * Must be imported BEFORE any Baileys code runs.
 */

import { resolve } from 'path';
import { existsSync } from 'fs';

// §10 standard: PROXY_URL + WHATSAPP_NEEDS_PROXY
const PROXY_URL = process.env.WHATSAPP_NEEDS_PROXY === 'true'
  ? (process.env.PROXY_URL || '')
  : '';

if (PROXY_URL) {
  // Find https-proxy-agent
  const agentPaths = [
    resolve(import.meta.dir, '../../node_modules/https-proxy-agent'),
    resolve(import.meta.dir, '../../../../openclaw-code/node_modules/https-proxy-agent'),
    resolve(import.meta.dir, '../../vendor/baileys-sdk/node_modules/https-proxy-agent'),
  ];

  let agentModule: any;
  for (const p of agentPaths) {
    if (existsSync(resolve(p, 'dist/index.js'))) {
      agentModule = require(resolve(p, 'dist/index.js'));
      break;
    }
  }

  if (agentModule) {
    const { HttpsProxyAgent } = agentModule;
    const proxyAgent = new HttpsProxyAgent(PROXY_URL);

    // Find and patch the Baileys socket.js module
    const socketPaths = [
      resolve(import.meta.dir, '../../vendor/baileys-sdk/node_modules/@whiskeysockets/baileys/lib/Socket/socket.js'),
      resolve(import.meta.dir, '../../../../openclaw-code/node_modules/@whiskeysockets/baileys/lib/Socket/socket.js'),
      resolve(import.meta.dir, '../../node_modules/@whiskeysockets/baileys/lib/Socket/socket.js'),
    ];

    let patched = false;
    for (const socketPath of socketPaths) {
      if (!existsSync(socketPath)) continue;

      // Read the original file
      const fs = require('fs');
      let code = fs.readFileSync(socketPath, 'utf-8');

      // Check if already patched
      if (code.includes('__PROXY_PATCHED__')) {
        console.log(`[channel-host] Baileys already proxy-patched`);
        patched = true;
        break;
      }

      // Patch: inject agent into the config passed to WebSocketClient
      // Original: const ws = new WebSocketClient(url, config);
      // Patched:  config.agent = proxyAgent; const ws = new WebSocketClient(url, config);
      const original = 'const ws = new WebSocketClient(url, config);';
      if (code.includes(original)) {
        const patchedCode = code.replace(
          original,
          `// __PROXY_PATCHED__\n    if (!config.agent && process.env.WHATSAPP_NEEDS_PROXY === 'true' && process.env.PROXY_URL) { try { config.agent = new (require("https-proxy-agent").HttpsProxyAgent)(process.env.PROXY_URL); } catch {} }\n    ${original}`,
        );
        fs.writeFileSync(socketPath, patchedCode);
        console.log(`[channel-host] Baileys proxy patch applied to ${socketPath}`);
        patched = true;
        break;
      }
    }

    if (!patched) {
      console.warn(`[channel-host] Could not patch Baileys for proxy support`);
    }
  } else {
    console.warn(`[channel-host] https-proxy-agent not found, WebSocket proxy not available`);
  }
} else {
  // No proxy configured
}
