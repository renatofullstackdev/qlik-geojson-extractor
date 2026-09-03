const SESSION_CONTEXT_KEY = "qlikGeojsonGrantedTabContext";

async function configureSidePanel() {
  try {
    // We handle the action click ourselves so we can capture the tab before
    // the Side Panel starts. Do not let Chrome bypass chrome.action.onClicked.
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    console.error("Could not configure side-panel behavior", error);
  }
}

async function rememberActionTab(tab) {
  if (!tab?.id || !tab?.windowId) {
    throw new Error("The extension action did not provide a valid browser tab.");
  }

  // activeTab is granted by this toolbar click. In this callback Chrome may
  // expose the sensitive tab URL without requiring persistent host access.
  // Avoid scripting here: the Side Panel will request the exact Qlik host as
  // an optional host permission before any page injection occurs.
  const refreshed = tab.url ? tab : await chrome.tabs.get(tab.id);
  const url = refreshed?.url;
  if (!url) {
    throw new Error("Could not read the current page URL after the extension was invoked.");
  }

  const context = {
    tabId: tab.id,
    windowId: tab.windowId,
    url,
    capturedAt: Date.now()
  };

  await chrome.storage.session.set({ [SESSION_CONTEXT_KEY]: context });
  return context;
}

chrome.action.onClicked.addListener((tab) => {
  // sidePanel.open() is user-gesture sensitive, so start it directly from the
  // action callback. Storing the context may complete slightly later; the
  // panel retries session storage briefly during startup.
  const openPromise = chrome.sidePanel.open({ tabId: tab.id });
  const rememberPromise = rememberActionTab(tab);

  void Promise.allSettled([openPromise, rememberPromise]).then(async ([opened, remembered]) => {
    if (opened.status === "rejected") {
      console.error("Could not open the Qlik GeoJSON Side Panel", opened.reason);
    }
    if (remembered.status === "rejected") {
      console.error("Could not remember the invoked tab", remembered.reason);
      await chrome.storage.session.remove(SESSION_CONTEXT_KEY);
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const stored = (await chrome.storage.session.get(SESSION_CONTEXT_KEY))[SESSION_CONTEXT_KEY];
    if (stored?.tabId === tabId) {
      await chrome.storage.session.remove(SESSION_CONTEXT_KEY);
    }
  })();
});

void configureSidePanel();
