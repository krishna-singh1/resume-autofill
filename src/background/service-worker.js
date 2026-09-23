/**
 * Injects the autofill logic on demand and brokers the popup's requests.
 *
 * Injection is deliberate: there is no declared content script, so pages the
 * user never asks about run none of this extension's code.
 */

const AUTOFILL_MODULE = 'src/content/autofill.js';
const UNSUPPORTED = /^(chrome|edge|about|devtools|chrome-extension|view-source):/;

/**
 * Run the autofill module in every frame of a tab.
 * Frames that refuse injection (sandboxed, cross-origin restricted) are
 * reported rather than thrown, since the main frame usually still succeeds.
 */
async function runInTab(tabId, url, options) {
  if (UNSUPPORTED.test(url || '')) {
    return { ok: false, error: 'This page does not allow extensions to run.' };
  }

  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      args: [chrome.runtime.getURL(AUTOFILL_MODULE), options],
      func: async (moduleUrl, runOptions) => {
        const module = await import(moduleUrl);
        return module.runAutofill(runOptions);
      },
    });

    const reports = injections.map((injection) => injection.result).filter(Boolean);
    return { ok: true, reports };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not run on this page.' };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'run-autofill') return undefined;

  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ ok: false, error: 'No active tab.' });
      return;
    }
    sendResponse(
      await runInTab(tab.id, tab.url, { dryRun: Boolean(message.dryRun), collect: Boolean(message.collect) }),
    );
  })();

  return true; // keep the message channel open for the async reply
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-form') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await runInTab(tab.id, tab.url, { dryRun: false });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') await chrome.runtime.openOptionsPage();
});
