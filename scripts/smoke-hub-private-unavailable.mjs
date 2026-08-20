import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const previewPort = 4187;
const cdpPort = 9347;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const screenshotPath = path.join(tmpdir(), 'qortium-chat-hub-private-unavailable-smoke.png');
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-hub-private-unavailable-'));
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
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'Evaluation failed.');
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
    window.__hubPrivateSmoke = { calls: [] };
    const account = 'Qqortal1111111111111111111111111111';
    const nodeResult = (data) => ({
      body: JSON.stringify(data),
      contentLength: JSON.stringify(data).length,
      contentType: 'application/json',
      data,
      ok: true,
      status: 200,
      statusText: 'OK'
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      let data;
      if (url.pathname.startsWith('/groups/member/')) {
        data = [
          { groupId: 12, groupName: 'Public Hub Group', isOpen: true, memberCount: 10 },
          { groupId: 13, groupName: 'Private Hub Group', isOpen: false, memberCount: 4 }
        ];
      } else if (url.pathname.startsWith('/chat/active/')) {
        data = { direct: [], groups: [] };
      } else if (url.pathname.startsWith('/groups/members/13')) {
        data = { members: [{ member: account, joined: 1786914000000 }] };
      } else if (url.pathname.startsWith('/names/address/') || url.pathname.startsWith('/transactions/search')) {
        data = [];
      } else {
        return originalFetch(input, init);
      }

      const body = JSON.stringify(data);
      return new Response(body, { headers: { 'content-type': 'application/json' }, status: 200 });
    };

    window.qortalRequest = async (request) => {
      window.__hubPrivateSmoke.calls.push({ ...request });
      switch (String(request.action || '').toUpperCase()) {
        case 'SHOW_ACTIONS':
          return [
            'FETCH_NODE_API',
            'GET_PRIMARY_NAME',
            'GET_USER_ACCOUNT',
            'SEARCH_CHAT_MESSAGES',
            'SEND_CHAT_MESSAGE'
          ];
        case 'WHICH_UI':
          return 'HUB_ELECTRON';
        case 'IS_USING_PUBLIC_NODE':
          return false;
        case 'GET_USER_ACCOUNT':
          return { address: account, publicKey: 'hub-public-key' };
        case 'GET_PRIMARY_NAME':
          return { name: 'Hub User' };
        case 'FETCH_NODE_API': {
          const path = String(request.path || '');
          if (path.startsWith('/groups/member/')) {
            return nodeResult([
              { groupId: 12, groupName: 'Public Hub Group', isOpen: true, memberCount: 10 },
              { groupId: 13, groupName: 'Private Hub Group', isOpen: false, memberCount: 4 }
            ]);
          }
          if (path.startsWith('/chat/active/')) return nodeResult({ direct: [], groups: [] });
          if (path.startsWith('/groups/members/13')) {
            return nodeResult({ members: [{ member: account, joined: 1786914000000 }] });
          }
          if (path.startsWith('/names/address/')) return nodeResult([]);
          if (path.startsWith('/transactions/search')) return nodeResult([]);
          return nodeResult([]);
        }
        case 'SEARCH_CHAT_MESSAGES':
          return [];
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

  const sidebar = await waitUntil('Hub private capability indicators', 12_000, async () =>
    evaluate(client, `(() => {
      const networks = Array.from(document.querySelectorAll('.network-section__title'))
        .map((heading) => heading.textContent.trim());
      const directPanel = Array.from(document.querySelectorAll('.panel')).find(
        (panel) => panel.querySelector('h2')?.textContent.trim() === 'Direct'
      );
      const privateRow = Array.from(document.querySelectorAll('.group-row')).find(
        (row) => row.querySelector('.group-row__name')?.textContent.trim() === 'Private Hub Group'
      );
      const plus = directPanel?.querySelector('.icon-button');
      const ready = networks.length === 1 && networks[0] === 'Qortal' &&
        directPanel?.querySelector('.panel__toggle')?.getAttribute('aria-expanded') === 'false' &&
        directPanel?.querySelector('.panel__count')?.textContent.trim() === '—' &&
        directPanel?.querySelector('.panel__unavailable') && plus?.disabled &&
        privateRow?.querySelector('.group-row__lock') &&
        privateRow?.querySelector('.group-row__unavailable') && !privateRow.disabled;

      return ready ? {
        directCount: directPanel.querySelector('.panel__count').textContent.trim(),
        directTitle: directPanel.querySelector('.panel__unavailable').getAttribute('title'),
        networks,
        privateTitle: privateRow.querySelector('.group-row__unavailable').getAttribute('title')
      } : null;
    })()`),
  );

  await evaluate(client, `Array.from(document.querySelectorAll('.group-row')).find(
    (row) => row.querySelector('.group-row__name')?.textContent.trim() === 'Private Hub Group'
  )?.click()`);

  const selected = await waitUntil('settled unavailable private-group view', 8_000, async () =>
    evaluate(client, `(() => {
      const pane = document.querySelector('.chat-pane');
      const title = pane?.querySelector('.chat-pane__title')?.textContent.trim();
      const empty = pane?.querySelector('.chat-pane__content .empty')?.textContent.trim() || '';
      const composer = pane?.querySelector('.composer--notice')?.textContent.trim() || '';
      const ready = title === 'Private Hub Group' &&
        pane.querySelector('.chat-pane__title-lock') &&
        pane.querySelector('.chat-pane__title-unavailable') &&
        !pane.querySelector('.skeleton-list') &&
        empty.includes('Closed / private history unavailable') &&
        composer.includes("Private chats aren't available in xchat through Qortal Hub") &&
        !composer.includes('approval');

      return ready ? { composer, empty, title } : null;
    })()`),
  );

  const screenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const privateActionCalls = await evaluate(client, `window.__hubPrivateSmoke.calls.filter(
    (call) => String(call.action || '').includes('PRIVATE_GROUP') || String(call.action || '').includes('PRIVATE_DIRECT')
  ).length`);
  if (privateActionCalls !== 0) {
    throw new Error(`Hub smoke attempted ${privateActionCalls} unsupported private bridge action(s).`);
  }

  console.log(JSON.stringify({ privateActionCalls, screenshotPath, selected, sidebar }, null, 2));
} catch (error) {
  if (client) {
    const debug = await evaluate(client, `({
      body: document.body.innerText,
      calls: window.__hubPrivateSmoke?.calls,
      networks: Array.from(document.querySelectorAll('.network-section__title')).map((node) => node.textContent.trim()),
      panels: Array.from(document.querySelectorAll('.panel')).map((panel) => ({
        count: panel.querySelector('.panel__count')?.textContent.trim(),
        disabled: panel.querySelector('.icon-button')?.disabled,
        title: panel.querySelector('h2')?.textContent.trim(),
        unavailable: !!panel.querySelector('.panel__unavailable')
      })),
      rows: Array.from(document.querySelectorAll('.group-row')).map((row) => ({
        lock: !!row.querySelector('.group-row__lock'),
        name: row.querySelector('.group-row__name')?.textContent.trim(),
        unavailable: !!row.querySelector('.group-row__unavailable')
      }))
    })`);
    console.error(JSON.stringify(debug, null, 2));
  }
  throw error;
} finally {
  client?.close();
  for (const child of children.reverse()) child.kill('SIGTERM');
  await delay(150);
  rmSync(browserProfile, { force: true, recursive: true });
}
