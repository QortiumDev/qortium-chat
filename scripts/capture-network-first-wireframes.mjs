import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const cdpPort = 9352;
const browserProfile = mkdtempSync(path.join(tmpdir(), 'qortium-chat-wireframes-'));
const sourceUrl = pathToFileURL(path.join(repoRoot, 'docs', 'wireframes', 'network-first-chat.html')).href;
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

function launch(command, args) {
  const child = spawn(command, args, { cwd: repoRoot, stdio: 'ignore' });
  children.push(child);
  return child;
}

async function capture(client, { height, mobile, name, query = '', width }) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height,
    mobile,
    screenHeight: height,
    screenWidth: width,
    width,
  });
  await client.send('Page.navigate', { url: `${sourceUrl}${query}` });
  await waitUntil(name, async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: "document.readyState === 'complete' && Boolean(document.querySelector('.network--qortal'))",
      returnByValue: true,
    });
    return result.result?.value === true;
  });
  const screenshot = await client.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  const outputPath = path.join(repoRoot, 'docs', 'wireframes', name);
  writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
  return outputPath;
}

let client;

try {
  launch('/usr/bin/chromium', [
    '--disable-gpu',
    '--headless=new',
    '--no-first-run',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${browserProfile}`,
    '--window-size=1280,800',
    'about:blank',
  ]);
  const target = await waitUntil('Chromium target', async () => {
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
  });
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  const outputs = [];
  outputs.push(await capture(client, {
    height: 800,
    mobile: false,
    name: 'network-first-chat-desktop.png',
    width: 1280,
  }));
  outputs.push(await capture(client, {
    height: 844,
    mobile: true,
    name: 'network-first-chat-mobile-list.png',
    width: 390,
  }));
  outputs.push(await capture(client, {
    height: 844,
    mobile: true,
    name: 'network-first-chat-mobile-chat.png',
    query: '?view=chat',
    width: 390,
  }));

  console.log(JSON.stringify({ outputs }, null, 2));
} finally {
  client?.socket.close();
  for (const child of children.reverse()) child.kill('SIGTERM');
  await delay(150);
  rmSync(browserProfile, { force: true, recursive: true });
}
