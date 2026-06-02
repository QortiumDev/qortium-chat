import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_NODE_API_URL = 'http://127.0.0.1:24891';
const DEFAULT_NAME = 'QortiumHomeTest';
const DEFAULT_IDENTIFIER = 'qortium-chat';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 180_000;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_BASE = BigInt(BASE58_ALPHABET.length);
const REGISTER_NAME_TRANSACTION_TYPE = 3;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeApiUrl = (process.env.QORTIUM_CHAT_NODE_API_URL ?? DEFAULT_NODE_API_URL).replace(/\/+$/, '');
const publishName = process.env.QORTIUM_CHAT_QDN_NAME ?? DEFAULT_NAME;
const identifier = process.env.QORTIUM_CHAT_QDN_IDENTIFIER ?? DEFAULT_IDENTIFIER;
const service = process.env.QORTIUM_CHAT_QDN_SERVICE ?? 'APP';
const distPath = path.resolve(repoRoot, process.env.QORTIUM_CHAT_DIST_PATH ?? 'dist');
const apiKeyPath = expandHomePath(
  process.env.QORTIUM_CHAT_NODE_API_KEY_PATH ?? '~/git/qortium/preview/apikey.txt',
);
const previewAccountsPath = expandHomePath(
  process.env.QORTIUM_CHAT_PREVIEW_ACCOUNTS_PATH ??
    '~/git/qortium/preview/secrets/initial-minting-accounts.json',
);

function expandHomePath(filePath) {
  if (filePath === '~') {
    return homedir();
  }

  if (filePath.startsWith('~/')) {
    return path.join(homedir(), filePath.slice(2));
  }

  return filePath;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8').trim();
}

function decodeBase58(value) {
  let decoded = 0n;

  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error(`Invalid Base58 character: ${character}`);
    }

    decoded = decoded * BASE58_BASE + BigInt(index);
  }

  const bytes = [];

  while (decoded > 0n) {
    bytes.unshift(Number(decoded % 256n));
    decoded /= 256n;
  }

  for (const character of value) {
    if (character !== '1') {
      break;
    }

    bytes.unshift(0);
  }

  return Buffer.from(bytes);
}

function encodeBase58(bytes) {
  let value = 0n;

  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }

  let encoded = '';

  while (value > 0n) {
    const remainder = Number(value % BASE58_BASE);
    value /= BASE58_BASE;
    encoded = BASE58_ALPHABET[remainder] + encoded;
  }

  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }

    encoded = '1' + encoded;
  }

  return encoded || '1';
}

function intBytes(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32BE(value);

  return bytes;
}

function longBytes(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64BE(BigInt(value));

  return bytes;
}

function sizedStringBytes(value) {
  const stringBytes = Buffer.from(value, 'utf8');

  return Buffer.concat([intBytes(stringBytes.length), stringBytes]);
}

function buildRegisterNameRawBytes58({ account, data, name, timestamp }) {
  const publicKey = decodeBase58(account.accountPublicKey);

  if (publicKey.length !== 32) {
    throw new Error(`Local account public key must decode to 32 bytes, got ${publicKey.length}.`);
  }

  return encodeBase58(
    Buffer.concat([
      intBytes(REGISTER_NAME_TRANSACTION_TYPE),
      longBytes(timestamp),
      intBytes(0),
      publicKey,
      intBytes(0),
      sizedStringBytes(name),
      sizedStringBytes(data),
      longBytes(0),
    ]),
  );
}

function getLocalPreviewAccount() {
  const previewAccounts = readJson(previewAccountsPath);
  const account = previewAccounts.accounts?.find((item) => item.role === 'local');

  if (!account?.accountAddress || !account?.accountPrivateKey || !account?.accountPublicKey) {
    throw new Error(`Local preview account was not found in ${previewAccountsPath}.`);
  }

  return account;
}

function getHeaders(contentType) {
  const headers = {
    'X-API-KEY': apiKey,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

function appendQuery(pathname, query) {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    queryParams.set(key, String(value));
  }

  const queryString = queryParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

async function request(pathname, options = {}) {
  const response = await fetch(`${nodeApiUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `${options.method ?? 'GET'} ${pathname} failed with HTTP ${response.status}.`);
  }

  return text;
}

async function requestJson(pathname, options = {}) {
  const text = await request(pathname, options);

  return text ? JSON.parse(text) : null;
}

async function waitFor(label, predicate) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    try {
      const result = await predicate();

      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out waiting for ${label}.${lastError instanceof Error ? ` Last error: ${lastError.message}` : ''}`,
  );
}

async function signAndProcess(rawUnsignedBytes58, privateKey58, computePath = '/arbitrary/compute') {
  const rawUnsignedWithNonce58 = await request(computePath, {
    method: 'POST',
    headers: getHeaders('text/plain'),
    body: rawUnsignedBytes58,
  });
  const signedBytes58 = await request('/transactions/sign', {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify({
      privateKey: privateKey58,
      transactionBytes: rawUnsignedWithNonce58,
    }),
  });
  const processResult = await request('/transactions/process', {
    method: 'POST',
    headers: getHeaders('text/plain'),
    body: signedBytes58,
  });

  if (processResult.trim() !== 'true' && !processResult.includes('"type"')) {
    throw new Error(`Transaction was not accepted: ${processResult}`);
  }

  return signedBytes58;
}

async function getNameInfo(name) {
  const response = await fetch(`${nodeApiUrl}/names/${encodeURIComponent(name)}`);

  if (response.status === 404) {
    return null;
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Name lookup failed with HTTP ${response.status}.`);
  }

  return JSON.parse(text);
}

async function ensureNameRegistered(name, account) {
  const existingName = await getNameInfo(name);

  if (existingName) {
    if (existingName.owner !== account.accountAddress) {
      throw new Error(`${name} is already registered to ${existingName.owner}.`);
    }

    console.log(`Name already registered: ${name} (${existingName.owner})`);
    return;
  }

  console.log(`Registering name with mempow: ${name}`);

  const rawRegisterBytes58 = buildRegisterNameRawBytes58({
    account,
    timestamp: Date.now(),
    name,
    data: JSON.stringify({
      app: 'Qortium Chat',
      purpose: 'QDN chat app preview',
    }),
  });

  await signAndProcess(rawRegisterBytes58, account.accountPrivateKey, '/transactions/mempow/compute');
  await waitFor(`name ${name}`, async () => {
    const nameInfo = await getNameInfo(name);

    return nameInfo?.owner === account.accountAddress ? nameInfo : null;
  });

  console.log(`Name registered: ${name}`);
}

async function getResourceStatus() {
  return requestJson(
    `/arbitrary/resource/status/${service}/${encodeURIComponent(publishName)}/${encodeURIComponent(identifier)}?build=true`,
    {
      headers: getHeaders(),
    },
  );
}

async function publishResource(account) {
  const resourcePathname = `/arbitrary/${service}/${encodeURIComponent(publishName)}/${encodeURIComponent(identifier)}`;
  const rawUnsignedBytes58 = await request(
    appendQuery(resourcePathname, {
      title: 'Qortium Chat',
      description: 'QDN chat app for Qortium Home',
      fee: 0,
    }),
    {
      method: 'POST',
      headers: getHeaders('text/plain'),
      body: distPath,
    },
  );

  await signAndProcess(rawUnsignedBytes58, account.accountPrivateKey);
}

const apiKey = process.env.QORTIUM_CHAT_NODE_API_KEY?.trim() || readText(apiKeyPath);
const account = getLocalPreviewAccount();

console.log(`Node: ${nodeApiUrl}`);
console.log(`Owner: ${account.accountAddress}`);
console.log(`Resource: qdn://${service}/${publishName}/${identifier}`);
console.log(`Source: ${distPath}`);

const status = await requestJson('/admin/status');

if (!status || status.syncPercent !== 100 || status.isSynchronizing) {
  throw new Error(`Node is not synced: ${JSON.stringify(status)}`);
}

await ensureNameRegistered(publishName, account);
await publishResource(account);

const readyStatus = await waitFor(`${service}/${publishName}/${identifier}`, async () => {
  const resourceStatus = await getResourceStatus();

  if (resourceStatus?.status === 'READY') {
    return resourceStatus;
  }

  if (resourceStatus?.status === 'BLOCKED' || resourceStatus?.status === 'BUILD_FAILED') {
    throw new Error(`${service}/${publishName}/${identifier} status is ${resourceStatus.status}.`);
  }

  return null;
});

console.log(`Ready: qdn://${service}/${publishName}/${identifier}`);
console.log(`Status: ${readyStatus.status}${readyStatus.description ? ` - ${readyStatus.description}` : ''}`);
