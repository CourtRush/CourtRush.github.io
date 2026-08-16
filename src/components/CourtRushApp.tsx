"use client";

import Image from "next/image";
import Script from "next/script";
import { useEffect, useState } from "react";

const firebaseScripts = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check-compat.js",
];

const criticalThemeStyles = `
  :root[data-theme="light"], html:not([data-theme="dark"]) {
    --bg:#F4F8F6; --panel:#FCFEFD; --ink:#102B28; --muted:#526F69; --line:#CFE0DB;
    --hero-start:#0E5F58; --hero-end:#0A3F3A; --ball:#D6E62B;
  }
  :root[data-theme="light"] body, html:not([data-theme="dark"]) body {
    background:linear-gradient(180deg,rgba(14,95,88,.08),transparent 260px),#F4F8F6!important;
    color:#102B28!important;
  }
  :root[data-theme="light"] .topbar, html:not([data-theme="dark"]) .topbar {
    background:linear-gradient(180deg,#F9FCFB 0%,#EEF6F3 100%)!important;
    color:#102B28!important;
  }
  :root[data-theme="light"] .panel,
  :root[data-theme="light"] .date-range-bar,
  :root[data-theme="light"] .exact-date-selector,
  html:not([data-theme="dark"]) .panel,
  html:not([data-theme="dark"]) .date-range-bar,
  html:not([data-theme="dark"]) .exact-date-selector {
    background:#FCFEFD!important;
    border-color:#CFE0DB!important;
    color:#102B28!important;
  }
  :root[data-theme="light"] .hero,
  :root[data-theme="light"] .club-hub-hero,
  :root[data-theme="light"] .my-profile-hero,
  html:not([data-theme="dark"]) .hero,
  html:not([data-theme="dark"]) .club-hub-hero,
  html:not([data-theme="dark"]) .my-profile-hero {
    background:linear-gradient(135deg,#0E6F66 0%,#094C46 64%,#123F27 100%)!important;
    color:#FFFFFF!important;
  }
  :root[data-theme="light"] .hero h1,
  :root[data-theme="light"] .hero p,
  :root[data-theme="light"] .club-hub-hero h1,
  :root[data-theme="light"] .club-hub-hero p,
  html:not([data-theme="dark"]) .hero h1,
  html:not([data-theme="dark"]) .hero p,
  html:not([data-theme="dark"]) .club-hub-hero h1,
  html:not([data-theme="dark"]) .club-hub-hero p {
    color:#FFFFFF!important;
  }
  :root[data-theme="light"] .score-tile,
  :root[data-theme="light"] .profile-hero-stat,
  html:not([data-theme="dark"]) .score-tile,
  html:not([data-theme="dark"]) .profile-hero-stat {
    background:rgba(4,38,35,.58)!important;
    border-color:rgba(255,255,255,.2)!important;
    color:#FFFFFF!important;
  }
  :root[data-theme="light"] .score-tile .lbl,
  :root[data-theme="light"] .score-tile .meta,
  html:not([data-theme="dark"]) .score-tile .lbl,
  html:not([data-theme="dark"]) .score-tile .meta {
    color:rgba(255,255,255,.78)!important;
  }
  :root[data-theme="light"] .btn-primary:hover, html:not([data-theme="dark"]) .btn-primary:hover {
    background:#12786F!important; color:#FFFFFF!important; -webkit-text-fill-color:#FFFFFF!important;
  }
  :root[data-theme="light"] .btn-ball:hover, html:not([data-theme="dark"]) .btn-ball:hover {
    background:#C3D322!important; color:#0B2321!important; -webkit-text-fill-color:#0B2321!important;
  }
  :root[data-theme="light"] .court-card, html:not([data-theme="dark"]) .court-card {
    background:#FCFEFD!important; border-color:#BFD8D2!important;
  }
  :root[data-theme="light"] .court-head, html:not([data-theme="dark"]) .court-head {
    background:#0E5F58!important; color:#FFFFFF!important;
  }
  :root[data-theme="light"] .court-body, html:not([data-theme="dark"]) .court-body {
    background:#F8FCFA!important; color:#102B28!important;
  }
  :root[data-theme="light"] .team-row, html:not([data-theme="dark"]) .team-row {
    background:#FFFFFF!important; border:1px solid #CFE0DB!important; color:#102B28!important;
  }
  :root[data-theme="light"] .score-inputs input, html:not([data-theme="dark"]) .score-inputs input {
    background:#FFFFFF!important; color:#102B28!important; border-color:#CFE0DB!important;
  }
  :root[data-theme="light"] .paddle-row, html:not([data-theme="dark"]) .paddle-row,
  :root[data-theme="light"] .participant-pill, html:not([data-theme="dark"]) .participant-pill {
    background:#FCFEFD!important; color:#102B28!important; border-color:#CFE0DB!important;
  }
  :root[data-theme="light"] .round-label, html:not([data-theme="dark"]) .round-label {
    color:#0A3F3A!important;
  }
  :root[data-theme="dark"] .team-row,
  :root[data-theme="dark"] .participant-pill,
  :root[data-theme="dark"] .paddle-row {
    color:#F4FFFC!important;
  }
  :root[data-theme="dark"] .team-row .p-name,
  :root[data-theme="dark"] .team-row .player-name-self,
  :root[data-theme="dark"] .participant-pill .p-name,
  :root[data-theme="dark"] .participant-pill .player-name-self,
  :root[data-theme="dark"] .paddle-row .p-name,
  :root[data-theme="dark"] .paddle-row .player-name-self {
    color:#F4FFFC!important; opacity:1!important;
  }
  :root[data-theme="dark"] .player-name-self {
    background:#DCEB45!important; color:#071B19!important;
  }
  :root[data-theme="dark"] .score-inputs input {
    background:#071F1C!important; border-color:#4C746D!important; color:#F4FFFC!important;
  }
  :root[data-theme="dark"] .score-inputs .muted,
  :root[data-theme="dark"] .score-inputs span {
    color:#BFE6DF!important; font-weight:900!important;
  }
  :root[data-theme="dark"] .court-body .btn-ball {
    background:#DCEB45!important; color:#071B19!important; -webkit-text-fill-color:#071B19!important;
  }
  :root[data-theme="dark"] .paddle-row.self-player {
    background:#DCEB45!important; border-color:#B8C825!important; color:#071B19!important;
  }
  :root[data-theme="dark"] .paddle-row.self-player .p-order,
  :root[data-theme="dark"] .paddle-row.self-player .p-name,
  :root[data-theme="dark"] .paddle-row.self-player .player-name-self {
    color:#071B19!important; -webkit-text-fill-color:#071B19!important;
  }
  :root[data-theme="dark"] .team-row:has(.player-name-self) {
    background:#DCEB45!important; border-color:#B8C825!important; color:#071B19!important;
  }
  :root[data-theme="dark"] .team-row:has(.player-name-self) .p-name,
  :root[data-theme="dark"] .team-row:has(.player-name-self) .player-name-self {
    color:#071B19!important; -webkit-text-fill-color:#071B19!important;
  }
  :root[data-theme="light"] .paddle-row.self-player,
  html:not([data-theme="dark"]) .paddle-row.self-player {
    background:#0E5F58!important; border-color:#0A3F3A!important; color:#FFFFFF!important;
  }
  :root[data-theme="light"] .paddle-row.self-player .p-order,
  :root[data-theme="light"] .paddle-row.self-player .p-name,
  :root[data-theme="light"] .paddle-row.self-player .player-name-self,
  html:not([data-theme="dark"]) .paddle-row.self-player .p-order,
  html:not([data-theme="dark"]) .paddle-row.self-player .p-name,
  html:not([data-theme="dark"]) .paddle-row.self-player .player-name-self {
    color:#FFFFFF!important; -webkit-text-fill-color:#FFFFFF!important;
  }
  :root[data-theme="light"] .team-row:has(.player-name-self),
  html:not([data-theme="dark"]) .team-row:has(.player-name-self) {
    background:#0E5F58!important; border-color:#0A3F3A!important; color:#FFFFFF!important;
  }
  :root[data-theme="light"] .team-row:has(.player-name-self) .p-name,
  :root[data-theme="light"] .team-row:has(.player-name-self) .player-name-self,
  html:not([data-theme="dark"]) .team-row:has(.player-name-self) .p-name,
  html:not([data-theme="dark"]) .team-row:has(.player-name-self) .player-name-self {
    color:#FFFFFF!important; -webkit-text-fill-color:#FFFFFF!important;
  }
  @media (max-width:980px) {
    #root { padding-left:12px!important; padding-right:12px!important; padding-bottom:28px!important; }
    .topbar {
      position:sticky!important; top:0!important; z-index:80!important;
      display:grid!important; grid-template-columns:minmax(0,1fr)!important;
      grid-template-rows:auto auto!important;
      gap:10px!important; margin:0 -12px 10px!important; padding:12px!important;
      border-bottom:1px solid var(--line)!important; backdrop-filter:blur(14px);
    }
    .brand { grid-column:1/-1!important; min-width:0!important; padding-right:48px!important; }
    .brand-mark { width:42px!important; height:42px!important; border-radius:11px!important; }
    .brand-name { font-size:26px!important; }
    .brand-sub { font-size:10px!important; letter-spacing:.15em!important; }
    .topbar-right { display:contents!important; position:static!important; width:auto!important; }
    .topbar-actions { display:contents!important; }
    .primary-nav {
      display:block!important; position:static!important; grid-column:1/-1!important;
      width:100%!important; max-width:100%!important; min-width:0!important; overflow:hidden!important;
    }
    .nav-toggle, .nav-account { display:none!important; }
    .theme-toggle {
      position:absolute!important; top:18px!important; right:14px!important; z-index:82!important;
      display:inline-flex!important; align-items:center!important; justify-content:center!important;
      width:36px!important; height:36px!important; min-width:36px!important; min-height:36px!important; max-width:36px!important;
      padding:0!important; border-radius:50%!important; overflow:hidden!important;
      border:1px solid rgba(14,95,88,.28)!important; background:rgba(252,254,253,.94)!important;
      color:var(--court)!important; box-shadow:0 8px 22px rgba(10,63,58,.16)!important;
    }
    :root[data-theme="dark"] .theme-toggle {
      background:rgba(15,29,27,.92)!important; color:#DCEB45!important; border-color:rgba(114,224,214,.35)!important;
    }
    nav.toolbar, nav.toolbar.open {
      position:static!important; grid-column:1/-1!important; justify-self:stretch!important; z-index:1!important;
      display:flex!important; width:100%!important; max-width:100%!important; min-width:0!important;
      gap:3px!important; padding:8px 0 0!important; overflow-x:auto!important;
      border:0!important; border-top:1px solid var(--line)!important; border-radius:0!important;
      background:transparent!important; box-shadow:none!important; scrollbar-width:none!important;
    }
    nav.toolbar button {
      flex:0 0 auto!important; min-width:72px!important; min-height:42px!important;
      padding:7px 8px!important; border-radius:9px!important; text-align:center!important;
      white-space:normal!important; font-size:10.5px!important; line-height:1.15!important;
    }
  }
`;

export default function CourtRushApp() {
  const [loadedFirebaseScripts, setLoadedFirebaseScripts] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("picklehub_theme");
      const theme =
        cached === "dark" || cached === "light"
          ? cached
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let mounted = true;

    const isLocalPreview =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "";

    if (process.env.NODE_ENV !== "production" || isLocalPreview) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("courtrush-pwa-"))
            .forEach((key) => caches.delete(key));
        });
      }
      return () => {
        mounted = false;
      };
    }

    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller && mounted) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "COURTRUSH_VERSION_READY" && mounted) setUpdateReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const firebaseReady = loadedFirebaseScripts === firebaseScripts.length;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: criticalThemeStyles }} />
      {firebaseScripts.map((src) => (
        <Script
          key={src}
          src={src}
          strategy="afterInteractive"
          onLoad={() => setLoadedFirebaseScripts((count) => count + 1)}
        />
      ))}
      {firebaseReady ? (
        <Script id="courtrush-legacy-app" src="/legacy-app.js" strategy="afterInteractive" />
      ) : null}
      <main id="root" className="courtrush-shell" aria-live="polite">
        <div className="boot-card">
          <Image src="/courtrush-icon.svg" alt="" width={56} height={56} priority />
          <div>
            <p className="boot-eyebrow">CourtRush</p>
            <h1>Loading the club</h1>
          </div>
        </div>
      </main>
      <div id="toast" />
      {updateReady ? (
        <button className="update-toast" type="button" onClick={() => location.reload()}>
          New version ready. Tap to refresh.
        </button>
      ) : null}
    </>
  );
}
