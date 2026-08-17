import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const previewPort = 4182;
const cdpPort = 9342;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const screenshotPath = path.join(tmpdir(), 'qortium-chat-mobile-density-smoke.png');
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-mobile-density-'));
const children = [];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(label, check) {
  const deadline = Date.now() + 12_000;

  while (Date.now() < deadline) {
    const result = await check().catch(() => null);

    if (result) return result;
    await delay(100);
  }

  throw new Error(`${label} timed out.`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);

      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  return result.result?.value;
}

function launch(command, args) {
  const child = spawn(command, args, { cwd: repoRoot, stdio: 'ignore' });

  children.push(child);
  return child;
}

const bootstrap = `
  (() => {
    const self = 'Qmobile111111111111111111111111111';
    const peer = 'Qpeer22222222222222222222222222222';
    const messages = Array.from({ length: 30 }, (_, index) => ({
      data: btoa(index % 4 === 0
        ? 'A longer mobile message wraps onto another line to show the compact row spacing clearly.'
        : 'Mobile density message ' + String(index + 1)),
      decryptionStatus: 'DECRYPTED',
      encoding: 'BASE64',
      isEncrypted: true,
      isText: true,
      recipient: index % 2 ? peer : self,
      sender: index % 2 ? self : peer,
      senderName: index % 2 ? 'Mobile Self' : 'Mobile Peer',
      signature: 'mobile-' + String(index),
      timestamp: 1720000000000 + index * 60000,
      txGroupId: 0
    }));
    const direct = {
      address: peer,
      data: messages.at(-1).data,
      decryptionStatus: 'DECRYPTED',
      encoding: 'BASE64',
      isEncrypted: true,
      isText: true,
      name: 'Mobile Peer',
      recipient: peer,
      sender: self,
      signature: messages.at(-1).signature,
      timestamp: messages.at(-1).timestamp
    };
    localStorage.setItem(
      'qortium-chat:v2:last:qortium:' + self,
      JSON.stringify({ kind: 'direct', direct: { address: peer, name: 'Mobile Peer' }, network: 'qortium' })
    );
    localStorage.setItem('qortium-chat:v2:last-network', JSON.stringify('qortium'));
    window.qdnRequest = async (request) => {
      switch (String(request.action || '').toUpperCase()) {
        case 'SHOW_ACTIONS':
          return [
            'GET_ACCOUNT_GROUPS', 'GET_ACCOUNT_GROUP_JOIN_REQUESTS', 'GET_ACTIVE_CHATS',
            'GET_ADMIN_GROUP_JOIN_REQUESTS', 'GET_MINTING_STATUS', 'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
            'GET_SELECTED_ACCOUNT', 'RESOLVE_IDENTITIES', 'SEARCH_CHAT_MESSAGES',
            'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES', 'SEND_CHAT_MESSAGE'
          ];
        case 'WHICH_UI': return 'QORTIUM_HOME_ELECTRON';
        case 'IS_USING_PUBLIC_NODE': return false;
        case 'GET_SELECTED_ACCOUNT':
          return { address: self, avatarUrl: null, isUnlocked: true, name: 'Mobile Self' };
        case 'GET_ACCOUNT_GROUPS':
        case 'GET_ACCOUNT_GROUP_JOIN_REQUESTS':
        case 'GET_ADMIN_GROUP_JOIN_REQUESTS':
          return [];
        case 'GET_ACTIVE_CHATS': return { direct: [direct], groups: [] };
        case 'GET_PRIVATE_DIRECT_ACTIVE_CHATS': return [direct];
        case 'GET_MINTING_STATUS':
          return { address: self, hasRewardShare: false, isMinting: false, keyOnNode: false, nodeMintingPossible: false };
        case 'RESOLVE_IDENTITIES':
          return request.addresses.map((address) => ({ address, name: address === self ? 'Mobile Self' : 'Mobile Peer' }));
        case 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES': return messages;
        case 'SEARCH_CHAT_MESSAGES': return [];
        case 'FETCH_NODE_API':
          return { body: '[]', contentLength: 2, contentType: 'application/json', data: [], ok: true, status: 200, statusText: 'OK' };
        default: return [];
      }
    };
  })();
`;

let client;

try {
  launch(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview', '--host', '127.0.0.1', '--port', String(previewPort),
  ]);
  await waitUntil('Vite preview', async () => (await fetch(previewUrl)).ok);
  launch('/usr/bin/chromium', [
    '--disable-gpu', '--headless=new', '--no-first-run', '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${browserProfile}`,
    '--window-size=390,844', 'about:blank',
  ]);
  const target = await waitUntil('Chromium target', async () => {
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
  });
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1, height: 844, mobile: true, screenHeight: 844, screenWidth: 390, width: 390,
  });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
  await client.send('Page.navigate', { url: previewUrl });
  await waitUntil('mobile direct chat', async () => {
    const title = await evaluate(client, "document.querySelector('.chat-pane__title')?.textContent || ''");
    const count = await evaluate(client, "document.querySelectorAll('.message').length");
    return title.includes('Mobile Peer') && count === 30;
  });
  await evaluate(client, "document.querySelector('.direct-row').click()");
  await waitUntil('visible mobile conversation', async () =>
    evaluate(client, "getComputedStyle(document.querySelector('.chat-pane')).display === 'grid'"),
  );
  const metrics = await evaluate(client, `(() => {
    const message = document.querySelector('.message');
    const list = document.querySelector('.message-list');
    const composer = document.querySelector('.composer');
    const composerToolbar = document.querySelector('.composer__toolbar');
    const sendButton = document.querySelector('.composer__send');
    return {
      composerPaddingTop: getComputedStyle(composer).paddingTop,
      composerToolbarDisplay: getComputedStyle(composerToolbar).display,
      listGap: getComputedStyle(list).gap,
      listPaddingTop: getComputedStyle(list).paddingTop,
      messagePadding: getComputedStyle(message).padding,
      sendButtonMinWidth: getComputedStyle(sendButton).minWidth
    };
  })()`);
  const screenshot = await client.send('Page.captureScreenshot', { captureBeyondViewport: false, format: 'png' });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  if (JSON.stringify(metrics) !== JSON.stringify({
    composerPaddingTop: '10px',
    composerToolbarDisplay: 'flex',
    listGap: '7px',
    listPaddingTop: '10px',
    messagePadding: '9px 11px',
    sendButtonMinWidth: '82px',
  })) {
    throw new Error(`Unexpected mobile density metrics: ${JSON.stringify(metrics)}`);
  }

  console.log(JSON.stringify({ metrics, screenshotPath }, null, 2));
} finally {
  client?.socket.close();
  for (const child of children.reverse()) child.kill('SIGTERM');
  await delay(150);
  rmSync(browserProfile, { force: true, recursive: true });
}
