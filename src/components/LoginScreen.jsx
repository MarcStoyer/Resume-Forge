import React, { useState } from "react";
import { getSupabase } from "../lib/supabase.js";

export default function LoginScreen({ configurationError = "" }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(configurationError);

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setMessage("");
    setError("");

    try {
      const { error: otpError } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (otpError) throw otpError;
      setMessage("Check your email for a secure sign-in link.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-10">
        <section>
          <div className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-200/10 px-3 py-1 text-xs font-medium tracking-wide text-amber-200">
            PRIVATE WORKSPACE · REVIEWABLE AI
          </div>
          <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-tight tracking-tight text-white sm:text-6xl">
            Build a stronger application without losing your voice.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-300">
            Résumé Forge brings résumé tailoring, cover letters, job tracking, and polished exports into one focused workspace.
          </p>

          <div className="mt-8 grid max-w-xl gap-4 text-sm text-stone-300 sm:grid-cols-2">
            {[
              ["Tailor with control", "Review AI suggestions and keep every claim grounded in your real experience."],
              ["Start with a real CV", "Explore the complete Marc Stoyer résumé as the editable starter document."],
              ["Track applications", "Save job descriptions, versions, notes, and status history together."],
              ["Export cleanly", "Create polished PDF and DOCX files from multiple professional layouts."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-medium text-white">{title}</div>
                <div className="mt-1 leading-6 text-stone-400">{text}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-stone-400">
            <span>Designed and built by Marc Stoyer</span>
            <a href="https://github.com/MarcStoyer/Resume-Forge" target="_blank" rel="noreferrer" className="text-amber-200 hover:text-amber-100">GitHub ↗</a>
            <a href="https://www.linkedin.com/in/marc-stoyer" target="_blank" rel="noreferrer" className="text-amber-200 hover:text-amber-100">LinkedIn ↗</a>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white p-7 text-stone-800 shadow-2xl shadow-black/30 sm:p-9">
          <div className="text-sm font-medium uppercase tracking-[0.18em] text-amber-700">Résumé Forge</div>
          <h2 className="mt-3 text-2xl font-semibold text-stone-950">Open your workspace</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">Use a secure email link—no password to remember.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block text-sm font-medium text-stone-700">
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>
            <button
              type="submit"
              disabled={sending || !email.trim() || Boolean(configurationError)}
              className="w-full rounded-lg bg-stone-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-50"
            >
              {sending ? "Sending secure link…" : "Email me a sign-in link"}
            </button>
          </form>

          {message && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

          <p className="mt-6 text-xs leading-5 text-stone-500">
            Your edits and saved applications are isolated to your account using Supabase Row Level Security.
          </p>
        </section>
      </div>
    </div>
  );
}
