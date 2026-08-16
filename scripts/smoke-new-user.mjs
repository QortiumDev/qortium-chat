import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const previewPort = 4181;
const cdpPort = 9341;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const desktopScreenshotPath = path.join(tmpdir(), 'qortium-chat-new-user-desktop-smoke.png');
const discoveryScreenshotPath = path.join(tmpdir(), 'qortium-chat-membership-discovery-smoke.png');
const mobileScreenshotPath = path.join(tmpdir(), 'qortium-chat-new-user-mobile-smoke.png');
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-new-user-smoke-'));
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
    localStorage.setItem('qortium-chat:sidebarCollapse', JSON.stringify({ direct: true, groups: false }));
    window.__newUserSmoke = { calls: [] };
    window.qdnRequest = async (request) => {
      window.__newUserSmoke.calls.push({ ...request });

      switch (String(request.action || '').toUpperCase()) {
        case 'SHOW_ACTIONS':
          return [
            'FETCH_NODE_API',
            'GET_ACCOUNT_GROUPS',
            'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
            'GET_ACTIVE_CHATS',
            'GET_ADMIN_GROUP_JOIN_REQUESTS',
            'GET_MINTING_STATUS',
            'SEARCH_CHAT_MESSAGES'
          ];
        case 'WHICH_UI':
          return 'QORTIUM_HOME_ELECTRON';
        case 'IS_USING_PUBLIC_NODE':
          return false;
        case 'GET_SELECTED_ACCOUNT':
          throw new Error('No account shared for newcomer smoke.');
        case 'FETCH_NODE_API':
          if (String(request.path || '').startsWith('/groups?')) {
            return {
              body: '[]',
              contentLength: 2,
              contentType: 'application/json',
              data: [
                { groupId: 7, groupName: 'Public Lounge', isOpen: true, memberCount: 14 },
                { groupId: 8, groupName: 'Quiet Public Group', isOpen: true, memberCount: 2 },
                { groupId: 9, groupName: 'Closed Group', isOpen: false, memberCount: 5 }
              ],
              ok: true,
              status: 200,
              statusText: 'OK'
            };
          }
          return {
            body: '[]',
            contentLength: 2,
            contentType: 'application/json',
            data: [],
            ok: true,
            status: 200,
            statusText: 'OK'
          };
        case 'SEARCH_CHAT_MESSAGES':
          return request.txGroupId === 7
            ? [{
                data: btoa('A public preview'),
                encoding: 'BASE64',
                isEncrypted: false,
                isText: true,
                sender: 'Qpreview1111111111111111111111111111',
                senderName: 'Previewer',
                signature: 'preview-signature',
                timestamp: 1786914000000,
                txGroupId: 7
              }]
            : [];
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

  const desktop = await waitUntil('membership-first newcomer view', 12_000, async () =>
    evaluate(
      client,
      `(() => {
        const row = document.querySelector('.group-row');
        const intro = document.querySelector('.panel__intro');
        const empty = document.querySelector('.empty');
        const notice = document.querySelector('.composer--notice');
        const title = document.querySelector('.chat-pane__title');
        const catalogueCalls = window.__newUserSmoke.calls.filter((call) =>
          String(call.path || '').startsWith('/groups?')
        ).length;

        return row && intro && empty && notice && title?.textContent.trim() === 'General Chat'
          ? {
              catalogueCalls,
              empty: empty.textContent.trim(),
              generalMetadata: row.querySelector('.group-row__footer').textContent.trim(),
              intro: intro.textContent.trim(),
              notice: notice.textContent.trim()
            }
          : null;
      })()`,
    ),
  );
  const desktopScreenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(desktopScreenshotPath, Buffer.from(desktopScreenshot.data, 'base64'));

  await waitUntil('initial selected-account refresh', 5_000, async () =>
    evaluate(
      client,
      `window.__newUserSmoke.calls.some(
        (call) => String(call.action || '').toUpperCase() === 'GET_SELECTED_ACCOUNT'
      )`,
    ),
  );

  await evaluate(
    client,
    `(() => {
      const panel = Array.from(document.querySelectorAll('.panel')).find(
        (candidate) => candidate.querySelector('h2')?.textContent.trim() === 'Groups'
      );
      panel?.querySelector('.panel__header-actions button[aria-label="Search groups"]')?.click();
    })()`,
  );
  await waitUntil('group discovery form', 5_000, async () =>
    evaluate(
      client,
      `(() => {
        const form = document.querySelector('form.search');
        if (!form) return false;
        form.requestSubmit();
        return true;
      })()`,
    ),
  );
  const discovery = await waitUntil('bounded public group discovery', 12_000, async () =>
    evaluate(
      client,
      `(() => {
        const rows = Array.from(document.querySelectorAll('.group-discovery .group-row'));
        const catalogueCalls = window.__newUserSmoke.calls.filter((call) =>
          String(call.path || '').startsWith('/groups?')
        ).length;
        const messageProbeIds = window.__newUserSmoke.calls
          .filter((call) => String(call.action || '').toUpperCase() === 'SEARCH_CHAT_MESSAGES' && call.txGroupId > 0)
          .map((call) => call.txGroupId)
          .sort((first, second) => first - second);

        return rows.length === 1
          ? {
              catalogueCalls,
              messageProbeIds,
              metadata: rows[0].querySelector('.group-row__footer')?.textContent.trim(),
              preview: rows[0].querySelector('.group-row__preview')?.textContent.trim(),
              title: rows[0].querySelector('.group-row__name')?.textContent.trim()
            }
          : null;
      })()`,
    ),
  );
  await evaluate(client, `document.querySelector('.group-discovery .group-row')?.click()`);
  await waitUntil('public preview conversation', 5_000, async () =>
    evaluate(client, `document.querySelector('.chat-pane__title')?.textContent.trim() === 'Public Lounge'`),
  );
  await delay(150);
  const discoveryScreenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(discoveryScreenshotPath, Buffer.from(discoveryScreenshot.data, 'base64'));

  await client.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 844,
    mobile: true,
    screenHeight: 844,
    screenWidth: 390,
    width: 390,
  });
  await evaluate(
    client,
    `Array.from(document.querySelectorAll('.group-row')).find(
      (row) => row.querySelector('.group-row__name')?.textContent.trim() === 'General Chat'
    )?.click()`,
  );
  const mobile = await waitUntil('mobile conversation view', 5_000, async () =>
    evaluate(
      client,
      `(() => {
        const pane = document.querySelector('.chat-pane');
        const notice = pane?.querySelector('.composer--notice');
        return pane && getComputedStyle(pane).display !== 'none' && notice
          ? { notice: notice.textContent.trim(), title: pane.querySelector('.chat-pane__title').textContent.trim() }
          : null;
      })()`,
    ),
  );
  const mobileScreenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(mobileScreenshotPath, Buffer.from(mobileScreenshot.data, 'base64'));

  if (
    desktop.catalogueCalls !== 0 ||
    !desktop.empty.includes('Say hello') ||
    desktop.generalMetadata.includes('id:0') ||
    !desktop.intro.includes('General Chat is public') ||
    !desktop.notice.includes('Share the selected account') ||
    discovery.catalogueCalls !== 1 ||
    JSON.stringify(discovery.messageProbeIds) !== JSON.stringify([7, 8]) ||
    discovery.title !== 'Public Lounge' ||
    discovery.preview !== 'A public preview' ||
    !discovery.metadata.includes('CHAT') ||
    !mobile.notice.includes('Share the selected account') ||
    mobile.title !== 'General Chat'
  ) {
    throw new Error(`New-user smoke assertions failed: ${JSON.stringify({ desktop, mobile })}`);
  }

  console.log(JSON.stringify({
    desktop,
    desktopScreenshotPath,
    discovery,
    discoveryScreenshotPath,
    mobile,
    mobileScreenshotPath,
  }, null, 2));
} finally {
  client?.close();

  for (const child of children.reverse()) {
    child.kill('SIGTERM');
  }

  await delay(150);
  rmSync(browserProfile, { force: true, recursive: true });
}
