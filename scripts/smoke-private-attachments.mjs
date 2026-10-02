// Browser regression for received private attachments; all bridge/data calls are synthetic.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const repoRoot = process.cwd();
const children = [];
const port = 4193, cdpPort = 9353;
const browserProfile = mkdtempSync(path.join(tmpdir(), 'chat-private-attachments-'));
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


let client;
try {
  launch(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port)]);
  await waitUntil('Vite', 10000, async () => (await fetch(`http://127.0.0.1:${port}/tests/private-attachments/index.html`)).ok);
  launch('/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${browserProfile}`, 'about:blank']);
  const target = await waitUntil('Chromium', 10000, async () => (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page'));
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/private-attachments/index.html` });
  const until = (label, expression) => waitUntil(label, 10000, () => evaluate(client, expression));
  const click = text => evaluate(client, `Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(text)})?.click()`);
  await until('attachment', `document.body.textContent.includes('Preview')`);
  assert.equal(await evaluate(client, `document.body.textContent.includes('Empty message')`), false);
  await click('Preview');
  await until('decrypted image', `document.querySelector('img')?.naturalWidth === 1`);
  assert.equal(await evaluate(client, `window.calls[0].descriptor.conversation.otherAddress`), 'Alice');
  await evaluate(client, `document.querySelector('.message__image-preview-button').click()`);
  await until('reusable lightbox image', `document.querySelector('.avatar-lightbox img')?.naturalWidth === 1`);
  await evaluate(client, `window.mode = 'fail'; Array.from(document.querySelectorAll('.avatar-lightbox button')).find(b => b.textContent === 'Save').click()`);
  await until('lightbox save error visible in message', `!document.querySelector('.avatar-lightbox') && document.querySelector('[role=alert]')?.textContent.includes('fixture fetch failed')`);
  await evaluate(client, `window.mode = 'fail'`);
  await click('Open');
  await until('visible open failure', `document.querySelector('[role=alert]')?.textContent.includes('fixture fetch failed')`);
  await click('Save');
  await until('visible save failure', `document.querySelector('[role=alert]')?.textContent.includes('fixture fetch failed')`);
  await evaluate(client, `window.mode = 'cancel'`);
  await click('Save');
  await until('save canceled', `document.body.textContent.includes('Save canceled.')`);
  await evaluate(client, `window.mode = 'ok'`);
  await click('Save');
  await until('save success', `document.body.textContent.includes('Attachment saved.')`);
  await click('Open');
  await until('open success', `window.calls.filter(c => c.action === 'OPEN_CHAT_ATTACHMENT_VIEWER').length === 2 && !document.querySelector('[role=alert]')`);
  assert.equal(await evaluate(client, `window.calls.every(c => c.descriptor.conversation.otherAddress === 'Alice')`), true);
  await evaluate(client, `window.resetAttachment('file')`);
  await until('new attachment', `!!Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Preview')`);
  await click('Preview');
  await until('non-image fallback', `document.body.textContent.includes('This file has no image preview')`);
  assert.equal(await evaluate(client, `!!document.querySelector('img')`), false);
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/qortium-chat-private-attachments-mobile.png', Buffer.from(screenshot.data, 'base64'));
  console.log('PASS: received image preview/lightbox, corrected recipient on every action, Open/Save errors, save cancel/success, non-image fallback, mobile render.');
} finally {
  client?.close();
  for (const child of children.reverse()) child.kill('SIGTERM');
  await delay(300);
  rmSync(browserProfile, { recursive: true, force: true });
}
