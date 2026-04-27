// background.js v4 — Service Worker
// Handles desktopCapture picker (only API that can't run in a page context)
// The recorder.html page does everything else (getUserMedia, MediaRecorder, download)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'request-desktop-capture') {
    log('message received', { action: msg.action });
    (async () => {
      try {
        const sources = ['screen', 'window', 'tab', 'audio'];

        // We need a tab to pass to chooseDesktopMedia.
        // Use the tab that sent this message (the recorder page itself)
        const callerTab = sender.tab;

        if (!callerTab) {
          // Fallback: query active tab
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) {
            sendResponse({ error: 'Nenhuma aba encontrada' });
            return;
          }
          chrome.desktopCapture.chooseDesktopMedia(sources, tab, handleResult);
        } else {
          chrome.desktopCapture.chooseDesktopMedia(sources, callerTab, handleResult);
        }

        function handleResult(streamId, options) {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          if (!streamId) {
            sendResponse({ error: 'cancelled' });
            return;
          }
          log('stream id obtained', { streamId: streamId.slice(0, 20) });
          sendResponse({ streamId });
        }

      } catch (err) {
        log('error', { message: err.message });
        sendResponse({ error: err.message });
      }
    })();
    return true; // async sendResponse
  }
});

// src/background.js
function log(action, data = {}) {
  console.log(`[BG] ${action}`, data)
}
