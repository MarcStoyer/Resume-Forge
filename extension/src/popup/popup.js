import { signIn, getSession } from "../lib/supabaseRest.js";
import { buildRow } from "../lib/buildRow.js";
import { APP_URL } from "../lib/config.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hideAll = () => ["signin", "no-job", "tracked", "capture"].forEach((s) => { $(s).hidden = true; });

let state = { job: null, existing: null, tabId: null };

$("open-app").href = APP_URL;

function renderTracked(existing) {
  hideAll();
  $("tracked-badge").textContent = existing.status === "applied" ? "APPLIED" : existing.status.toUpperCase();
  $("tracked-label").textContent = existing.label || "";
  $("advance").hidden = existing.status !== "saved";
  show("tracked");
}

function renderCapture(job) {
  hideAll();
  $("f-company").value = job.company || "";
  $("f-role").value = job.role || "";
  $("f-salary").value = job.salary || "";
  $("f-source").value = job.source || "";
  $("f-jd").value = job.jd || "";
  $("jd-count").textContent = job.jd ? `(${job.jd.length.toLocaleString()} chars captured)` : "(none found)";
  show("capture");
}

function currentJob() {
  return {
    ...state.job,
    company: $("f-company").value.trim(),
    role: $("f-role").value.trim(),
    salary: $("f-salary").value.trim(),
    source: $("f-source").value.trim(),
    jd: $("f-jd").value,
  };
}

async function commit(status, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Saving…";
  $("capture-err").hidden = true;
  try {
    const row = await browser.runtime.sendMessage({
      type: "save-application",
      row: buildRow(currentJob(), status),
      tabId: state.tabId,
    });
    renderTracked(row);
  } catch (e) {
    $("capture-err").textContent = e.message;
    $("capture-err").hidden = false;
    btn.disabled = false;
    btn.textContent = original;
  }
}

$("save").addEventListener("click", (e) => commit("saved", e.target));
$("applied").addEventListener("click", (e) => commit("applied", e.target));

$("advance").addEventListener("click", async (e) => {
  e.target.disabled = true;
  const row = await browser.runtime.sendMessage({
    type: "update-status", id: state.existing.id, tabId: state.tabId,
    patch: { status: "applied" },
  });
  renderTracked(row);
});

$("signin-btn").addEventListener("click", async () => {
  const btn = $("signin-btn");
  btn.disabled = true; btn.textContent = "Signing in…";
  $("signin-err").hidden = true;
  try {
    await signIn($("email").value.trim(), $("password").value);
    await init();
  } catch (e) {
    $("signin-err").textContent = e.message;
    $("signin-err").hidden = false;
    btn.disabled = false; btn.textContent = "Sign in";
  }
});

async function init() {
  hideAll();
  if (!(await getSession())) return show("signin");

  state = await browser.runtime.sendMessage({ type: "get-state" });
  if (state.existing) return renderTracked(state.existing);
  if (state.job) return renderCapture(state.job);
  show("no-job");
}

init();
