// Hub attachments smoke (attachments-matrix A1-A4): drives the built app in
// headless Chromium against a window.qortalRequest shim that mirrors REAL
// Qortal Hub's contract as read from its source (useQortalMessageListener.tsx
// listOfAllQortalRequests — notably NO FETCH_NODE_API and NO
// SELECT_QDN_PUBLISH_SOURCE — plus qortal/get.ts's inline-bytes
// PUBLISH_QDN_RESOURCE). Asserts, in a Qortal open group hosted by "Hub":
//   1. paperclip and link buttons are enabled (bytes path + node-API reach),
//   2. pasting a file stages it,
//   3. Send publishes inline base64 and the chat message carries the
//      qortal://use-embed/IMAGE link,
//   4. the link dialog searches /arbitrary/resources/search and inserts a
//      use-embed link into the draft.
// Run standalone: `node scripts/smoke-hub-attachments.mjs` (after `npm run build`).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const previewPort = 4189;
const cdpPort = 9349;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const screenshotPath = path.join(tmpdir(), 'qortium-chat-hub-attachments-smoke.png');
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-hub-attachments-'));
const children = [];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(label, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw new Error(`${label} timed out.${lastError ? ` ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP connection timed out.')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('CDP connection failed.'));
      }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = message.id ? this.pending.get(message.id) : null;
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'CDP request failed.'));
      else pending.resolve(message.result);
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

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Evaluation failed.',
    );
  }
  return response.result?.value;
}

function launch(command, args) {
  const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return child;
}

const bootstrap = `
  (() => {
    localStorage.clear();
    window.__hubAttachSmoke = { calls: [] };
    const account = 'Qqortal1111111111111111111111111111';
    const nodeData = (url) => {
      if (url.pathname.startsWith('/groups/member/')) {
        return [{ groupId: 12, groupName: 'Public Hub Group', isOpen: true, memberCount: 10 }];
      }
      if (url.pathname.startsWith('/chat/active/')) return { direct: [], groups: [] };
      if (url.pathname.startsWith('/names/address/')) return [{ name: 'hubuser', owner: account }];
      if (url.pathname.startsWith('/names/primary/')) return { name: 'hubuser', owner: account };
      if (url.pathname.startsWith('/arbitrary/resources/search')) {
        return [
          { created: 1756700000000, identifier: 'pic-1', name: 'alice', service: 'IMAGE', size: 2048 },
          { created: 1756600000000, identifier: 'doc-1', name: 'bob', service: 'DOCUMENT', size: 512 }
        ];
      }
      if (url.pathname.startsWith('/transactions/search')) return [];
      if (url.pathname.startsWith('/chat/messages')) return [];
      return [];
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      const isNodeApi = ['/groups', '/chat', '/names', '/arbitrary', '/transactions'].some(
        (prefix) => url.pathname.startsWith(prefix)
      );
      if (!isNodeApi) return originalFetch(input, init);
      const body = JSON.stringify(nodeData(url));
      return new Response(body, { headers: { 'content-type': 'application/json' }, status: 200 });
    };

    // Real Hub's SHOW_ACTIONS surface (attachment-relevant slice of
    // listOfAllQortalRequests): no FETCH_NODE_API, no SELECT_QDN_PUBLISH_SOURCE,
    // no PUBLISH_CHAT_ATTACHMENT.
    const HUB_ACTIONS = [
      'GET_PRIMARY_NAME',
      'GET_QDN_RESOURCE_STATUS',
      'GET_QDN_RESOURCE_URL',
      'GET_USER_ACCOUNT',
      'IS_USING_PUBLIC_NODE',
      'LIST_GROUPS',
      'LIST_QDN_RESOURCES',
      'PUBLISH_MULTIPLE_QDN_RESOURCES',
      'PUBLISH_QDN_RESOURCE',
      'SAVE_FILE',
      'SEARCH_CHAT_MESSAGES',
      'SEARCH_QDN_RESOURCES',
      'SEND_CHAT_MESSAGE',
      'SHOW_ACTIONS',
      'WHICH_UI'
    ];

    window.qortalRequest = async (request) => {
      const action = String(request.action || '').toUpperCase();
      window.__hubAttachSmoke.calls.push(JSON.parse(JSON.stringify({ ...request })));
      switch (action) {
        case 'SHOW_ACTIONS':
          return HUB_ACTIONS;
        case 'WHICH_UI':
          return 'HUB_ELECTRON';
        case 'IS_USING_PUBLIC_NODE':
          return false;
        case 'GET_USER_ACCOUNT':
          return { address: account, publicKey: 'hub-public-key' };
        case 'GET_PRIMARY_NAME':
          return 'hubuser';
        case 'SEARCH_CHAT_MESSAGES':
          return [];
        case 'PUBLISH_QDN_RESOURCE':
          // Hub returns the node's transaction response; any resolve = published.
          return { signature: 'smoke-tx-signature', type: 'ARBITRARY' };
        case 'SEND_CHAT_MESSAGE':
          return { signature: 'smoke-chat-signature', timestamp: Date.now() };
        default:
          return [];
      }
    };
  })();
`;

let client;

try {
  launch(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
  ]);
  await waitUntil('Vite preview', 10_000, async () => (await fetch(previewUrl)).ok);

  launch('/usr/bin/chromium', [
    '--disable-gpu',
    '--headless=new',
    '--no-first-run',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${browserProfile}`,
    '--window-size=1100,760',
    'about:blank',
  ]);
  const target = await waitUntil('Chromium target', 10_000, async () => {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const targets = await response.json();
    return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
  });

  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
  await client.send('Page.navigate', { url: previewUrl });

  await waitUntil('Qortal open group row', 15_000, async () =>
    evaluate(client, `!!Array.from(document.querySelectorAll('.group-row'))
      .find((row) => row.querySelector('.group-row__name')?.textContent.trim() === 'Public Hub Group')`),
  );
  await evaluate(client, `Array.from(document.querySelectorAll('.group-row'))
    .find((row) => row.querySelector('.group-row__name')?.textContent.trim() === 'Public Hub Group')?.click()`);

  // 1. Composer buttons: paperclip enabled through the bytes path, link
  //    button enabled through Hub's same-origin node API.
  const buttons = await waitUntil('enabled attach + link buttons', 15_000, async () =>
    evaluate(client, `(() => {
      const attach = document.querySelector('.composer__attach');
      const link = document.querySelector('.composer__link-resource');
      const input = document.querySelector('.composer input[type="file"]');
      return attach && link && input && !attach.disabled && !link.disabled
        ? { attach: true, hiddenInput: true, link: true }
        : null;
    })()`),
  );

  // 2. Paste a PNG file into the composer textarea; the bytes path must stage it.
  await evaluate(client, `(async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNiYGBgAAAABQABp/uV2QAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'tiny.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const textarea = document.querySelector('.composer textarea');
    textarea.focus();
    textarea.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
  })()`);
  const staged = await waitUntil('pasted file staged', 10_000, async () =>
    evaluate(client, `(() => {
      const chip = document.querySelector('.composer__attachment');
      const name = chip?.querySelector('.composer__attachment-name')?.textContent.trim();
      const size = chip?.querySelector('.composer__attachment-size')?.textContent.trim() ?? '';
      // The processing phase shows the name too — only a real byte size means 'ready'.
      return name && name.startsWith('tiny') && /^\\d+(\\.\\d+)? (B|KB|MB)$/.test(size)
        ? { stagedName: name, stagedSize: size }
        : null;
    })()`),
  );

  // 3. Send: publish must go out as inline base64 and the message must carry
  //    the use-embed link.
  await evaluate(client, `document.querySelector('.composer button[type="submit"]')?.click()`);
  const wire = await waitUntil('publish + send captured', 15_000, async () =>
    evaluate(client, `(() => {
      const calls = window.__hubAttachSmoke.calls;
      const publish = calls.find((call) => String(call.action).toUpperCase() === 'PUBLISH_QDN_RESOURCE');
      const send = calls.find((call) => String(call.action).toUpperCase() === 'SEND_CHAT_MESSAGE');
      if (!publish || !send) return null;
      return {
        publish: {
          base64Bytes: typeof publish.base64 === 'string' ? publish.base64.length : 0,
          filename: publish.filename,
          identifier: publish.identifier,
          name: publish.name,
          service: publish.service,
          hasSourceToken: 'sourceToken' in publish
        },
        sendSerialized: JSON.stringify(send)
      };
    })()`),
  );

  if (
    wire.publish.base64Bytes < 10 ||
    !String(wire.publish.filename).startsWith('tiny') ||
    wire.publish.service !== 'IMAGE' ||
    wire.publish.name !== 'hubuser' ||
    !String(wire.publish.identifier).startsWith('qtm-chat_group_12_') ||
    wire.publish.hasSourceToken
  ) {
    throw new Error(`Publish wire shape wrong: ${JSON.stringify(wire.publish)}`);
  }
  if (!wire.sendSerialized.includes('qortal://use-embed/IMAGE?name=hubuser&service=IMAGE&identifier=qtm-chat_group_12_')) {
    throw new Error(`Sent message lacks the use-embed link: ${wire.sendSerialized.slice(0, 400)}`);
  }

  // 4. Link dialog: search any publisher's resources and insert a use-embed link.
  await evaluate(client, `document.querySelector('.composer__link-resource')?.click()`);
  await waitUntil('link dialog', 8_000, async () =>
    evaluate(client, `!!document.querySelector('.link-resource__search input[type="search"]')`),
  );
  await evaluate(client, `(() => {
    const input = document.querySelector('.link-resource__search input[type="search"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'alice');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(client, `document.querySelector('.link-resource__search button[type="submit"]')?.click()`);
  await waitUntil('search results', 10_000, async () =>
    evaluate(client, `document.querySelectorAll('.link-resource__result').length >= 2`),
  );
  await evaluate(client, `Array.from(document.querySelectorAll('.link-resource__result'))
    .find((row) => row.textContent.includes('alice'))
    ?.querySelector('button')?.click()`);
  const inserted = await waitUntil('link inserted into draft', 8_000, async () =>
    evaluate(client, `(() => {
      const value = document.querySelector('.composer textarea')?.value ?? '';
      return value.includes('qortal://use-embed/IMAGE?name=alice&service=IMAGE&identifier=pic-1') ? { draft: value } : null;
    })()`),
  );

  const screenshot = await client.send('Page.captureScreenshot', { captureBeyondViewport: false, format: 'png' });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  console.log(JSON.stringify({ buttons, inserted: inserted.draft.trim(), screenshotPath, staged, wire }, null, 2));
} catch (error) {
  if (client) {
    const debug = await evaluate(client, `({
      body: document.body.innerText.slice(0, 1500),
      errors: Array.from(document.querySelectorAll('.error')).map((node) => node.textContent.trim()),
      calls: (window.__hubAttachSmoke?.calls ?? []).map((call) => call.action),
      composerNotice: document.querySelector('.composer--notice')?.textContent ?? null
    })`).catch(() => null);
    if (debug) console.error(JSON.stringify(debug, null, 2));
  }
  throw error;
} finally {
  client?.close();
  for (const child of children.reverse()) child.kill('SIGTERM');
  await delay(150);
  rmSync(browserProfile, { force: true, recursive: true });
}
