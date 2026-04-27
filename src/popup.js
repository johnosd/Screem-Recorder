chrome.tabs.query({ url: chrome.runtime.getURL('recorder.html') }, (tabs) => {
  if (tabs.length > 0) {
    chrome.windows.update(tabs[0].windowId, { focused: true, state: 'normal' });
  } else {
    chrome.windows.create({
      url: chrome.runtime.getURL('recorder.html'),
      type: 'popup',
      width: 460,
      height: 640,
      focused: true
    });
  }
  window.close();
});
