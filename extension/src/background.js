// Coordinates between the content script (which sees the page) and the popup
// (which shows the controls). Also owns the toolbar badge.
//
// Firefox MV3 uses an event page (`background.scripts`), not a Chrome-style
// service worker — so this file can hold short-lived state between events, but
// must not assume it stays alive. Anything durable goes in storage.
import { findByJobUrl, insertApplication, updateApplication, getSession, adoptSession } from "./lib/supabaseRest.js";
import { buildRow } from "./lib/buildRow.js";

// Last scrape per tab, so the popup can render instantly instead of
// re-scraping when you click the toolbar icon.
const scraped = new Map();

function setBadge(tabId, tracked) {
  browser.action.setBadgeText({ tabId, text: tracked ? "✓" : "+" });
  browser.action.setBadgeBackgroundColor({ tabId, color: tracked ? "#0f766e" : "#1f4e5f" });
}

async function lookup(jobUrl) {
  try {
    const session = await getSession();
    if (!session) return { signedIn: false, existing: null };
    return { signedIn: true, existing: await findByJobUrl(jobUrl) };
  } catch (e) {
    return { signedIn: false, existing: null, error: e.message };
  }
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const tabId = sender.tab?.id;

  if (msg.type === "session-from-app") {
    await adoptSession(msg.session);
    return { ok: true };
  }

  if (msg.type === "job-detected") {
    const { signedIn, existing } = await lookup(msg.job.jobUrl);
    scraped.set(tabId, { job: msg.job, existing, signedIn });
    if (tabId != null) setBadge(tabId, !!existing);
    return { existing, signedIn };
  }

  if (msg.type === "get-state") {
    const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    const cached = scraped.get(tab?.id);
    if (cached) {
      // Re-check tracked status: it may have changed in the web app since.
      const { signedIn, existing } = await lookup(cached.job.jobUrl);
      const next = { ...cached, existing, signedIn };
      scraped.set(tab.id, next);
      if (tab?.id != null) setBadge(tab.id, !!existing);
      return { ...next, tabId: tab?.id };
    }
    return { job: null, existing: null, signedIn: (await getSession()) != null, tabId: tab?.id };
  }

  // From the in-page pill. Reports needsPopup rather than failing when there
  // is no session — credentials belong in the popup, not injected into a page.
  if (msg.type === "pill-save") {
    if (!(await getSession())) return { needsPopup: true };
    const row = await insertApplication(buildRow(msg.job, msg.status));
    if (tabId != null) {
      setBadge(tabId, true);
      const cached = scraped.get(tabId);
      if (cached) scraped.set(tabId, { ...cached, existing: row });
    }
    return row;
  }

  if (msg.type === "save-application") {
    const row = await insertApplication(msg.row);
    if (msg.tabId != null) setBadge(msg.tabId, true);
    const cached = scraped.get(msg.tabId);
    if (cached) scraped.set(msg.tabId, { ...cached, existing: row });
    browser.tabs.sendMessage(msg.tabId, { type: "tracked", status: row?.status }).catch(() => {});
    return row;
  }

  if (msg.type === "update-status") {
    const row = await updateApplication(msg.id, msg.patch);
    const target = msg.tabId ?? tabId;
    if (target != null) {
      setBadge(target, true);
      browser.tabs.sendMessage(target, { type: "tracked", status: row?.status }).catch(() => {});
    }
    return row;
  }

  return undefined;
});

browser.tabs.onRemoved.addListener((tabId) => scraped.delete(tabId));
