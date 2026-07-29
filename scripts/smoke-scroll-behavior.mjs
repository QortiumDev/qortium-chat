import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewPort = Number(process.env.QORTIUM_CHAT_SCROLL_SMOKE_PORT ?? 4178);
const cdpPort = Number(process.env.QORTIUM_CHAT_SCROLL_SMOKE_CDP_PORT ?? 9338);
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const screenshotPath =
  process.env.QORTIUM_CHAT_SCROLL_SMOKE_SCREENSHOT ??
  path.join(tmpdir(), 'qortium-chat-scroll-smoke.png');
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-scroll-smoke-'));
const children = [];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitUntil(label, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await check();

      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(`${label} did not become ready.${lastError ? ` ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.webSocket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('CDP WebSocket connection timed out.')),
        15_000,
      );

      this.webSocket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.webSocket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('CDP WebSocket connection failed.'));
      }, { once: true });
    });
    this.webSocket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = message.id ? this.pending.get(message.id) : null;

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message ?? 'CDP command failed.'));
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
      this.webSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.webSocket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'CDP evaluation failed.');
  }

  return result.result?.value;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  return response.json();
}

function launch(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.push(child);
  return child;
}

const bridgeBootstrap = `
  (() => {
    const selfAddress = 'Qself1111111111111111111111111111';
    const peerAddress = 'Qpeer2222222222222222222222222222';
    const baseTimestamp = 1720000000000;
    const allMessages = Array.from({ length: 240 }, (_, index) => ({
      data: btoa('Scroll smoke message ' + String(index + 1) + ' ' + 'detail '.repeat(index % 5)),
      decryptionStatus: 'DECRYPTED',
      encoding: 'BASE64',
      isEncrypted: true,
      isText: true,
      recipient: index % 2 === 0 ? selfAddress : peerAddress,
      sender: index % 2 === 0 ? peerAddress : selfAddress,
      senderName: index % 2 === 0 ? 'Scroll Peer' : 'Scroll Self',
      signature: 'scroll-smoke-' + String(index + 1),
      timestamp: baseTimestamp + index * 60000,
      txGroupId: 0
    }));
    const direct = {
      address: peerAddress,
      data: allMessages[allMessages.length - 1].data,
      decryptionStatus: 'DECRYPTED',
      encoding: 'BASE64',
      isEncrypted: true,
      isText: true,
      name: 'Scroll Peer',
      recipient: selfAddress,
      sender: peerAddress,
      signature: allMessages[allMessages.length - 1].signature,
      timestamp: allMessages[allMessages.length - 1].timestamp
    };

    localStorage.setItem(
      'qortium-chat:lastChat:' + selfAddress,
      JSON.stringify({ kind: 'direct', direct: { address: peerAddress, name: 'Scroll Peer' } })
    );
    window.__scrollSmoke = { directSearches: 0, olderSearches: 0 };
    window.qdnRequest = async (request) => {
      switch (String(request.action || '').toUpperCase()) {
        case 'SHOW_ACTIONS':
          return [
            'GET_ACCOUNT_GROUPS',
            'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
            'GET_ACTIVE_CHATS',
            'GET_ADMIN_GROUP_JOIN_REQUESTS',
            'GET_GROUP_MEMBERS',
            'GET_MINTING_STATUS',
            'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
            'GET_SELECTED_ACCOUNT',
            'RESOLVE_IDENTITIES',
            'SEARCH_CHAT_MESSAGES',
            'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES'
          ];
        case 'WHICH_UI':
          return 'QORTIUM_HOME_ELECTRON';
        case 'IS_USING_PUBLIC_NODE':
          return false;
        case 'GET_SELECTED_ACCOUNT':
          return {
            address: selfAddress,
            avatarUrl: null,
            isUnlocked: true,
            name: 'Scroll Self'
          };
        case 'GET_ACCOUNT_GROUPS':
        case 'GET_ACCOUNT_GROUP_JOIN_REQUESTS':
        case 'GET_ADMIN_GROUP_JOIN_REQUESTS':
        case 'GET_GROUP_MEMBERS':
          return [];
        case 'GET_ACTIVE_CHATS':
          return { direct: [direct], groups: [] };
        case 'GET_PRIVATE_DIRECT_ACTIVE_CHATS':
          return [direct];
        case 'GET_MINTING_STATUS':
          return {
            address: selfAddress,
            hasRewardShare: false,
            isMinting: false,
            keyOnNode: false,
            nodeMintingPossible: false
          };
        case 'RESOLVE_IDENTITIES':
          return request.addresses.map((address) => ({
            address,
            name: address === selfAddress ? 'Scroll Self' : 'Scroll Peer'
          }));
        case 'SEARCH_CHAT_MESSAGES':
          return [];
        case 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES': {
          window.__scrollSmoke.directSearches += 1;
          const limit = Number(request.limit) || 100;
          const before = typeof request.before === 'number' ? request.before : Infinity;
          const messages = allMessages.filter((message) => message.timestamp < before).slice(-limit);

          if (Number.isFinite(before)) {
            window.__scrollSmoke.olderSearches += 1;
            await new Promise((resolve) => setTimeout(resolve, 150));
          }

          return messages.map((message) => ({ ...message }));
        }
        case 'FETCH_NODE_API':
          return {
            body: '[]',
            contentLength: 2,
            contentType: 'application/json',
            data: [],
            ok: true,
            status: 200,
            statusText: 'OK'
          };
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
  await waitUntil('Vite preview', 15_000, async () => {
    const response = await fetch(previewUrl);
    return response.ok;
  });

  launch('/usr/bin/chromium', [
    '--disable-gpu',
    '--headless=new',
    '--no-first-run',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${browserProfile}`,
    '--window-size=1280,900',
    'about:blank',
  ]);

  const target = await waitUntil('Chromium CDP target', 15_000, async () => {
    const targets = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);

    return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
  });
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: bridgeBootstrap });
  await client.send('Page.navigate', { url: previewUrl });

  await waitUntil('initial direct-message feed', 15_000, async () => {
    const state = await evaluate(
      client,
      `(() => ({
        count: document.querySelectorAll('.message').length,
        title: document.querySelector('.chat-pane__title')?.textContent || ''
      }))()`,
    );

    return state?.count === 100 && state.title.includes('Scroll Peer') ? state : null;
  });
  // Let the initial bottom-restoration settle finish before the smoke takes
  // over the scroll position; input during that loop is intentionally ignored
  // unless it arrives as a pointer gesture (tested separately below).
  await delay(1_000);

  const listMetrics = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      const rect = list.getBoundingClientRect();
      return {
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    })()`,
  );
  assert(
    listMetrics.scrollHeight > listMetrics.clientHeight,
    `Message list is not scrollable (${JSON.stringify(listMetrics)}).`,
  );
  console.log(`Initial list metrics: ${JSON.stringify(listMetrics)}`);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await client.send('Input.dispatchMouseEvent', {
      deltaX: 0,
      deltaY: -1200,
      type: 'mouseWheel',
      x: listMetrics.x,
      y: listMetrics.y,
    });
    await delay(25);

    const scrollTop = await evaluate(
      client,
      "document.querySelector('.message-list').scrollTop",
    );

    if (scrollTop <= 80) {
      break;
    }
  }
  await waitUntil('near-top user scroll', 3_000, async () => {
    const state = await evaluate(
      client,
      `(() => ({
        olderSearches: window.__scrollSmoke.olderSearches,
        scrollTop: document.querySelector('.message-list').scrollTop
      }))()`,
    );

    return state.scrollTop <= 80 && state.olderSearches > 0 ? state : null;
  });

  const beforePrepend = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      const listTop = list.getBoundingClientRect().top;
      const visible = [...document.querySelectorAll('.message')]
        .find((message) => message.getBoundingClientRect().bottom > listTop + 1);
      return {
        offset: visible.getBoundingClientRect().top - listTop,
        text: visible.querySelector('.message__body')?.textContent || ''
      };
    })()`,
  );

  await waitUntil('older-message prepend', 10_000, async () => {
    const count = await evaluate(client, "document.querySelectorAll('.message').length");
    // Pagination deliberately overlaps the exclusive boundary message by one
    // millisecond, then dedupes it, so a 100-row page adds 99 new rows.
    return count >= 199 ? count : null;
  });
  await delay(250);

  const afterPrepend = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      const listTop = list.getBoundingClientRect().top;
      const visible = [...document.querySelectorAll('.message')]
        .find((message) => (message.querySelector('.message__body')?.textContent || '') === ${JSON.stringify(beforePrepend.text)});
      return {
        offset: visible?.getBoundingClientRect().top - listTop,
        searches: window.__scrollSmoke.olderSearches
      };
    })()`,
  );
  assert(afterPrepend.searches === 1, `Expected one older-page request, got ${afterPrepend.searches}.`);
  assert(
    Math.abs(afterPrepend.offset - beforePrepend.offset) <= 1,
    `Prepend anchor moved ${Math.abs(afterPrepend.offset - beforePrepend.offset).toFixed(2)}px.`,
  );

  const quietStart = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      list.scrollTop = Math.round((list.scrollHeight - list.clientHeight) * 0.45);
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
      const listTop = list.getBoundingClientRect().top;
      const visible = [...document.querySelectorAll('.message')]
        .find((message) => message.getBoundingClientRect().bottom > listTop + 1);
      window.__quietAnchorText = visible.querySelector('.message__body')?.textContent || '';
      window.__quietAnchorOffset = visible.getBoundingClientRect().top - listTop;
      return window.__scrollSmoke.directSearches;
    })()`,
  );
  await waitUntil('15-second quiet poll', 17_000, async () => {
    const searches = await evaluate(client, 'window.__scrollSmoke.directSearches');
    return searches > quietStart ? searches : null;
  });
  await delay(100);

  const quietResult = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      const listTop = list.getBoundingClientRect().top;
      const visible = [...document.querySelectorAll('.message')]
        .find((message) => (message.querySelector('.message__body')?.textContent || '') === window.__quietAnchorText);
      return {
        offset: visible?.getBoundingClientRect().top - listTop,
        originalOffset: window.__quietAnchorOffset
      };
    })()`,
  );
  assert(
    Math.abs(quietResult.offset - quietResult.originalOffset) <= 1,
    `Quiet poll moved the reading anchor ${Math.abs(quietResult.offset - quietResult.originalOffset).toFixed(2)}px.`,
  );

  await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      list.scrollTop = Math.round((list.scrollHeight - list.clientHeight) * 0.2);
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    })()`,
  );
  await waitUntil('scroll-to-bottom control', 5_000, async () =>
    evaluate(client, "!!document.querySelector('.message-feed__scroll-bottom')"),
  );
  const downButton = await evaluate(
    client,
    `(() => {
      const rect = document.querySelector('.message-feed__scroll-bottom').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  );
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    type: 'mousePressed',
    ...downButton,
  });
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    clickCount: 1,
    type: 'mouseReleased',
    ...downButton,
  });
  await delay(80);

  const scrollbar = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      const rect = list.getBoundingClientRect();
      const scrollbarWidth = list.offsetWidth - list.clientWidth;
      const range = list.scrollHeight - list.clientHeight;
      const thumbHeight = Math.max(20, list.clientHeight / list.scrollHeight * list.clientHeight);
      const thumbTop = rect.top + list.scrollTop / range * (list.clientHeight - thumbHeight);
      window.__pointerTarget = '';
      list.addEventListener('pointerdown', (event) => {
        window.__pointerTarget = event.target.className;
      }, { once: true, capture: true });
      return {
        endY: rect.top + list.clientHeight * 0.4,
        startY: thumbTop + thumbHeight / 2,
        x: rect.right - Math.max(2, scrollbarWidth / 2)
      };
    })()`,
  );
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    type: 'mousePressed',
    x: scrollbar.x,
    y: scrollbar.startY,
  });
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    type: 'mouseMoved',
    x: scrollbar.x,
    y: scrollbar.endY,
  });
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    clickCount: 1,
    type: 'mouseReleased',
    x: scrollbar.x,
    y: scrollbar.endY,
  });
  await delay(800);

  const pointerResult = await evaluate(
    client,
    `(() => {
      const list = document.querySelector('.message-list');
      return {
        bottomDistance: list.scrollHeight - list.scrollTop - list.clientHeight,
        pointerTarget: window.__pointerTarget,
        scrollTop: list.scrollTop
      };
    })()`,
  );
  assert(
    String(pointerResult.pointerTarget).includes('message-list'),
    `Native pointer targeted ${JSON.stringify(pointerResult.pointerTarget)}, not the scroll container.`,
  );
  assert(
    pointerResult.bottomDistance > 100,
    `Settle loop reclaimed the scrollbar drag (bottom distance ${pointerResult.bottomDistance}px).`,
  );

  const screenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  console.log(JSON.stringify({
    prependAnchorDeltaPx: Math.abs(afterPrepend.offset - beforePrepend.offset),
    pointerBottomDistancePx: pointerResult.bottomDistance,
    quietPollAnchorDeltaPx: Math.abs(quietResult.offset - quietResult.originalOffset),
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
