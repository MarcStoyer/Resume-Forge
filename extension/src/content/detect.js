// Detects a job posting and injects the pill.
//
// The pill is Simplify's good idea: put the control where the user is already
// looking, rather than relying on them remembering the toolbar exists. The
// popup stays available as the reliable path for pages where injection is
// awkward.
import { parseJobPage } from "../lib/jobParse.js";

let job = null;
let lastUrl = "";

function looksLikeJobPage(parsed) {
  // JSON-LD JobPosting is proof. Otherwise require a plausible role and a
  // URL that says "job" — better to show nothing than to badge every page.
  if (parsed.confidence === "high") return true;
  const urlSaysJob = /\/(jobs?|careers?|opening|position|vacanc)/i.test(location.pathname);
  return urlSaysJob && parsed.role.length > 3;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function removePill() {
  document.getElementById("rf-pill")?.remove();
}

function renderPill(existing) {
  removePill();
  if (!job) return;

  const pill = el("div");
  pill.id = "rf-pill";

  const title = el("span", "rf-title", job.company ? `${job.company} — ${job.role}` : job.role);
  pill.appendChild(title);

  if (existing) {
    const label = existing.status === "applied" ? "✓ Applied" : "★ Saved";
    const state = el("span", "rf-state", label);
    pill.appendChild(state);
    // Saved → Applied is the one advance worth offering inline; everything
    // else belongs in the app where the full status list lives.
    if (existing.status === "saved") {
      const advance = el("span", "rf-btn rf-applied", "Mark applied");
      advance.addEventListener("click", async () => {
        advance.textContent = "…";
        await browser.runtime.sendMessage({
          type: "update-status", id: existing.id, tabId: null,
          patch: { status: "applied" },
        });
        renderPill({ ...existing, status: "applied" });
      });
      pill.appendChild(advance);
    }
  } else {
    for (const [cls, label, status] of [["rf-save", "★ Save", "saved"], ["rf-applied", "✓ Applied", "applied"]]) {
      const btn = el("span", `rf-btn ${cls}`, label);
      btn.addEventListener("click", async () => {
        btn.textContent = "…";
        try {
          const res = await browser.runtime.sendMessage({ type: "pill-save", job, status });
          if (res?.needsPopup) {
            // Not signed in — the popup is where credentials get entered.
            btn.textContent = "Open extension →";
            return;
          }
          renderPill(res);
        } catch (e) {
          btn.textContent = "Failed";
        }
      });
      pill.appendChild(btn);
    }
  }

  const close = el("span", "rf-x", "×");
  close.title = "Hide for this page";
  close.addEventListener("click", removePill);
  pill.appendChild(close);

  document.body.appendChild(pill);
}

async function scan() {
  // Job boards are single-page apps; the URL changes without a reload.
  if (location.href === lastUrl) return;
  lastUrl = location.href;

  const parsed = parseJobPage(document, location.href);
  if (!looksLikeJobPage(parsed)) { job = null; removePill(); return; }
  job = parsed;

  const res = await browser.runtime.sendMessage({ type: "job-detected", job });
  renderPill(res?.existing || null);
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "tracked") renderPill({ id: "x", status: msg.status });
  if (msg.type === "rescan") { lastUrl = ""; scan(); }
});

// SPA navigation gives no load event, so poll the URL. Cheap, and far more
// reliable across boards than hooking history.pushState.
scan();
setInterval(scan, 1200);
