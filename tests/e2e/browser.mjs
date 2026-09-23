/**
 * Launches a Chromium-based browser with the unpacked extension loaded and
 * exposes a minimal DevTools-protocol client. Shared by the e2e runner and
 * the parse-file dev tool. No npm dependencies (Node >= 22 for WebSocket).
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Branded Google Chrome (137+) ignores --load-extension, so it is deliberately
 * absent here. Chromium, Chrome for Testing and Microsoft Edge all honour it.
 * Install Chrome for Testing with: npx @puppeteer/browsers install chrome@stable
 */
const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function waitUntil(fn, { timeout = 15000, interval = 150, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} ${message.error.data || ''}`));
      else resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    return sessionId;
  }

  /** Evaluate in a session and return the value; rejects on thrown exceptions. */
  async evaluate(sessionId, expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  /** Open a URL in a new tab and return its session once fully loaded. */
  async openPage(url) {
    const { targetId } = await this.send('Target.createTarget', { url });
    const session = await this.attach(targetId);
    await waitUntil(() => this.evaluate(session, `document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`), {
      label: `page ${url}`,
    });
    return { targetId, session };
  }

  closePage(targetId) {
    return this.send('Target.closeTarget', { targetId });
  }

  close() {
    this.socket.close();
  }
}

/**
 * Start a headless browser with the extension loaded.
 * @returns {Promise<{cdp: Cdp, extensionId: string, serviceWorker: string, browserName: string, close: () => void}>}
 */
export async function launchWithExtension({ extensionPath = ROOT, windowSize } = {}) {
  const executable = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error('No Chromium-based browser that supports --load-extension was found. Set CHROME_PATH.');
  }

  const debugPort = await freePort();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'resume-autofill-'));
  const child = spawn(
    executable,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      `--load-extension=${extensionPath}`,
      `--disable-extensions-except=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      ...(windowSize ? [`--window-size=${windowSize}`, '--force-device-scale-factor=1', '--hide-scrollbars'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const close = () => {
    child.kill('SIGKILL');
    rmSync(userDataDir, { recursive: true, force: true });
  };

  try {
    const version = await waitUntil(
      () => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json()),
      { label: 'DevTools endpoint' },
    );
    const cdp = await Cdp.connect(version.webSocketDebuggerUrl);

    // The service worker starts on install (it opens the options page), which
    // is also how we learn the extension id.
    const target = await waitUntil(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      return targetInfos.find((info) => info.type === 'service_worker' && info.url.includes('/service-worker.js'));
    }, { label: 'extension service worker' });

    return {
      cdp,
      extensionId: new URL(target.url).hostname,
      serviceWorker: await cdp.attach(target.targetId),
      browserName: path.basename(executable),
      close: () => {
        cdp.close();
        close();
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
