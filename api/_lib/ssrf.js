// SSRF-safe URL fetching for api/fetch-url.js.
//
// Threat model: a logged-in (but possibly malicious, or merely tricked)
// user submits a URL, and this server fetches it on their behalf. Without
// guards, that lets them make the server issue requests to internal/cloud
// infrastructure it can reach but the public internet cannot — most
// famously http://169.254.169.254/ (the AWS instance-metadata endpoint;
// Vercel Node functions run on AWS Lambda, so this is a live target here,
// not a theoretical one).
//
// Defense: resolve the hostname ourselves and reject anything outside the
// public "unicast" address range (an allowlist, not a denylist — fails
// closed on any address type we didn't think to name), re-validate on
// every redirect hop instead of only the initial URL, cap redirects, cap
// response size (both via Content-Length and while streaming, in case
// it's absent or wrong), enforce an overall timeout, and only accept
// text-ish content types.
//
// Residual limitation (disclosed, not hidden): this validates the
// resolved IP at request time but does not pin the TCP connection to that
// exact IP, so a narrow DNS-rebinding window between our lookup and
// fetch()'s own internal lookup isn't fully closed. That's a much harder,
// more advanced attack than the direct/redirect cases this guards
// against, which cover the overwhelming majority of real-world SSRF.

import dns from "node:dns";
import net from "node:net";
import ipaddr from "ipaddr.js";

export class SsrfError extends Error {}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a job-posting page's text
const DEFAULT_MAX_REDIRECTS = 5;
const ALLOWED_CONTENT_TYPE = /^(text\/|application\/(xhtml\+xml|xml)\b)/i;

// Allowlist: only a "unicast" (ordinary public) address may be fetched.
// Everything else — private, loopback, link-local (this is what covers the
// cloud metadata address), multicast, reserved, carrier-grade NAT, unique
// local, unspecified, and any exotic transition-mechanism range — is
// blocked. IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are unwrapped to
// their embedded IPv4 first, so that can't be used to sneak past an
// IPv4-only check.
export function isPrivateAddress(ip) {
  let addr;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true; // unparsable -> fail closed
  }
  if (addr.kind() === "ipv6" && typeof addr.isIPv4MappedAddress === "function" && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }
  return addr.range() !== "unicast";
}

function stripBrackets(hostname) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

// Parses + validates one URL: scheme must be http/https, and every IP the
// hostname resolves to (there can be several) must pass isPrivateAddress.
// A literal IP in the URL skips DNS and is checked directly.
export async function resolveAndValidate(urlString, { lookupFn = dns.promises.lookup } = {}) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfError("Invalid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new SsrfError("Only HTTP and HTTPS URLs are supported.");
  }

  const host = stripBrackets(parsed.hostname);

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfError("That address can't be fetched.");
    return parsed;
  }

  let records;
  try {
    records = await lookupFn(host, { all: true });
  } catch {
    throw new SsrfError("Couldn't resolve that host.");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new SsrfError("Couldn't resolve that host.");
  }
  for (const r of records) {
    const address = typeof r === "string" ? r : r.address;
    if (isPrivateAddress(address)) throw new SsrfError("That address can't be fetched.");
  }
  return parsed;
}

async function readBody(res, maxBytes) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType && !ALLOWED_CONTENT_TYPE.test(contentType)) {
    throw new SsrfError(`Unsupported content-type: ${contentType.split(";")[0]}.`);
  }

  const declaredLength = Number(res.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    throw new SsrfError("Response too large.");
  }

  const reader = res.body?.getReader?.();
  if (!reader) {
    // Fallback for a fetch implementation without a streamable body (e.g. a
    // simplified test double) — read fully, then enforce the cap.
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new SsrfError("Response too large.");
    return text;
  }

  const chunks = [];
  let received = 0;
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => {});
      throw new SsrfError("Response too large.");
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

// Fetches urlString, validating the destination (and every redirect hop)
// against isPrivateAddress, under one overall deadline for the whole
// chain. Returns { status, text } for the final, non-redirect response.
export async function safeFetch(urlString, opts = {}) {
  const {
    lookupFn,
    fetchImpl = fetch,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let currentUrl = urlString;
    for (let hop = 0; ; hop++) {
      if (hop > maxRedirects) throw new SsrfError("Too many redirects.");
      if (controller.signal.aborted) throw new SsrfError(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);

      const parsed = await resolveAndValidate(currentUrl, { lookupFn });

      let res;
      try {
        res = await fetchImpl(parsed.toString(), { headers, redirect: "manual", signal: controller.signal });
      } catch (e) {
        if (e.name === "AbortError" || controller.signal.aborted) {
          throw new SsrfError(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
        }
        throw new SsrfError("Couldn't fetch that URL: " + String(e.message || e));
      }

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        currentUrl = new URL(location, parsed).toString();
        continue;
      }

      const text = await readBody(res, maxBytes);
      return { status: res.status, text };
    }
  } finally {
    clearTimeout(timer);
  }
}
