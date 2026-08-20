import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const previewPort = 4180;
const cdpPort = 9340;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const screenshotPath = path.join(tmpdir(), 'qortium-chat-qortal-gateway-readonly-smoke.png');
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-qortal-gateway-smoke-'));
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

      if (value) {
        return value;
      }
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
      if (message.error) {
        pending.reject(new Error(message.error.message ?? 'CDP request failed.'));
      } else {
        pending.resolve(message.result);
      }
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
    throw new Error(response.exceptionDetails.text ?? 'Evaluation failed.');
  }

  return response.result?.value;
}

function launch(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.push(child);
  return child;
}

const bootstrap = `
  (() => {
    const sidebarKey = 'qortium-chat:sidebarCollapse';
    const notificationKey = 'qortium-chat-notifications-v2';
    localStorage.setItem(sidebarKey, JSON.stringify({ direct: true, groups: true }));
    localStorage.setItem(notificationKey, JSON.stringify({
      direct: true,
      mentions: true,
      replies: true,
      version: 2
    }));
    window._qdnContext = 'gateway';
    window.__gatewaySmoke = { calls: [], fetchCalls: [], websocketCount: 0 };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      window.__gatewaySmoke.fetchCalls.push(url.pathname + url.search);

      if (url.pathname === '/transactions/unconfirmed' && url.searchParams.get('txType') === 'MESSAGE') {
        return new Response('[]', {
          headers: { 'content-type': 'application/json' },
          status: 200
        });
      }

      return nativeFetch(input, init);
    };
    window.WebSocket = class {
      constructor() {
        window.__gatewaySmoke.websocketCount += 1;
        throw new Error('Gateway mode must not construct a WebSocket.');
      }
    };
    window.qortalRequest = async (request) => {
      window.__gatewaySmoke.calls.push({ ...request });

      switch (String(request.action || '').toUpperCase()) {
        case 'LIST_GROUPS':
          return [
            { groupId: 0, groupName: 'General Chat', isOpen: true },
            { groupId: 23, groupName: 'Public Test Group', isOpen: true }
          ];
        case 'SEARCH_CHAT_MESSAGES':
          return request.txGroupId === 23
            ? [{
                data: btoa(JSON.stringify({ messageText: 'gateway result', version: 3 })),
                encoding: 'BASE64',
                isEncrypted: false,
                isText: true,
                sender: 'Qsender',
                signature: 'gateway-message',
                timestamp: 1700000000000,
                txGroupId: 23
              }]
            : [];
        default:
          throw new Error('Unsupported Qortal gateway action: ' + request.action);
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

  const rendered = await waitUntil('Qortal gateway read-only UI', 12_000, async () =>
    evaluate(
      client,
      `(() => {
        const notices = [...document.querySelectorAll('.account-connect--gateway, .composer--notice')]
          .map((element) => element.textContent.trim())
          .filter(Boolean);
        const groupsToggle = [...document.querySelectorAll('.panel__toggle')]
          .find((button) => button.textContent.trim() === 'Groups');
        const selectedTitle = document.querySelector('.chat-pane__title, .chat-header__title')?.textContent.trim() ?? '';

        return notices.length >= 2 && groupsToggle && document.body.textContent.includes('General Chat')
          ? {
              connectButtons: document.querySelectorAll('.account-connect button').length,
              groupsExpanded: groupsToggle.getAttribute('aria-expanded'),
              notices,
              qortalSections: document.querySelectorAll('.network-section--qortal').length,
              qortiumSections: document.querySelectorAll('.network-section--qortium').length,
              selectedTitle
            }
          : null;
      })()`,
    ),
  );

  await evaluate(
    client,
    `(() => {
      const groupsToggle = [...document.querySelectorAll('.panel__toggle')]
        .find((button) => button.textContent.trim() === 'Groups');
      groupsToggle.click();
    })()`,
  );
  await delay(250);

  await evaluate(
    client,
    `(() => {
      const searchButton = document.querySelector('.network-section--qortal button[aria-label="Search groups"]');
      searchButton.click();
    })()`,
  );
  await delay(100);
  await evaluate(
    client,
    `(() => {
      document.querySelector('.network-section--qortal form.search').requestSubmit();
    })()`,
  );

  await waitUntil('Qortal public group results', 12_000, async () =>
    evaluate(client, `document.body.textContent.includes('Public Test Group')`),
  );

  const verified = await evaluate(
    client,
    `(() => ({
      calls: window.__gatewaySmoke.calls.map((call) => call.action),
      directPanels: [...document.querySelectorAll('.network-section--qortal .panel__toggle')]
        .filter((button) => button.textContent.trim() === 'Direct').length,
      fetchCalls: window.__gatewaySmoke.fetchCalls,
      groupsExpanded: [...document.querySelectorAll('.panel__toggle')]
        .find((button) => button.textContent.trim() === 'Groups')
        .getAttribute('aria-expanded'),
      loadingRows: document.querySelectorAll('.loading-row').length,
      notificationStorage: localStorage.getItem('qortium-chat-notifications-v2'),
      sidebarStorage: localStorage.getItem('qortium-chat:sidebarCollapse'),
      websocketCount: window.__gatewaySmoke.websocketCount
    }))()`,
  );
  const screenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const expectedSidebar = JSON.stringify({ direct: true, groups: true });
  const expectedNotifications = JSON.stringify({
    direct: true,
    mentions: true,
    replies: true,
    version: 2,
  });

  if (
    rendered.connectButtons !== 0 ||
    rendered.qortalSections !== 1 ||
    rendered.qortiumSections !== 0 ||
    rendered.groupsExpanded !== 'true' ||
    verified.groupsExpanded !== 'true' ||
    verified.directPanels !== 0 ||
    verified.loadingRows !== 0 ||
    verified.calls.includes('GET_USER_ACCOUNT') ||
    verified.calls.includes('SHOW_ACTIONS') ||
    verified.calls.includes('WHICH_UI') ||
    !verified.calls.includes('LIST_GROUPS') ||
    !verified.calls.includes('SEARCH_CHAT_MESSAGES') ||
    !verified.fetchCalls.some((url) => url.includes('/transactions/unconfirmed?txType=MESSAGE')) ||
    verified.sidebarStorage !== expectedSidebar ||
    verified.notificationStorage !== expectedNotifications ||
    verified.websocketCount !== 0
  ) {
    throw new Error(`Gateway smoke assertions failed: ${JSON.stringify({ rendered, verified })}`);
  }

  console.log(JSON.stringify({
    ...verified,
    connectButtons: rendered.connectButtons,
    notices: rendered.notices,
    screenshotPath,
  }, null, 2));
} finally {
  client?.close();

  for (const child of children.reverse()) {
    child.kill('SIGTERM');
  }

  await delay(150);
  rmSync(browserProfile, { force: true, recursive: true });
}
