import { logout, me, publishApk, tokenFromHash } from "./github.js";

const root = document.getElementById("app");
const state = {
  page: "store",
  token: tokenFromHash(),
  user: null,
  catalog: { apps: [], source: "loading" },
  err: sessionStorage.getItem("apkstore_error"),
};

sessionStorage.removeItem("apkstore_error");

boot();

async function boot() {
  render();
  if (state.token) {
    try {
      state.user = await me(state.token);
    } catch {
      logout();
      state.token = null;
    }
  }
  await loadCatalog();
  render();
}

async function loadCatalog() {
  try {
    const res = await fetch("/api/catalog");
    if (!res.ok) throw new Error("catalog failed");
    state.catalog = await res.json();
  } catch {
    state.catalog = {
      source: "demo",
      apps: [
        {
          name: "Night Market",
          description: "Preview card. After Netlify + OAuth, real repos with topic netlify-apk-store show up here.",
          owner: "demo",
          repo: "demo/night-market",
          htmlUrl: "https://github.com",
          stars: 12,
          release: {
            tag: "v1.0.0",
            downloads: 240,
            apkUrl: null,
            apkName: "night-market.apk",
            size: 18400000,
          },
        },
      ],
    };
  }
}

function render() {
  root.innerHTML = `
    <header class="top">
      <div class="brand" id="go-home">
        <div class="logo">A</div>
        <div>
          <b>APKstore</b>
          <span>GitHub Releases as an app store</span>
        </div>
      </div>
      <div class="nav">
        ${
          state.user
            ? `<div class="user"><img src="${state.user.avatar_url}" alt="" />@${state.user.login}</div>
               <button class="btn" id="go-publish">Publish APK</button>
               <button class="btn ghost" id="do-logout">Logout</button>`
            : `<button class="btn primary" id="do-login">Login with GitHub</button>`
        }
      </div>
    </header>
    <main class="wrap">${page()}</main>
  `;

  $("#go-home")?.addEventListener("click", () => {
    state.page = "store";
    render();
  });
  $("#do-login")?.addEventListener("click", () => {
    location.href = "/api/oauth-start";
  });
  $("#do-logout")?.addEventListener("click", () => {
    logout();
    state.token = null;
    state.user = null;
    state.page = "store";
    render();
  });
  $("#go-publish")?.addEventListener("click", () => {
    state.page = "publish";
    render();
    bindPublish();
  });
  if (state.page === "publish") bindPublish();
}

function page() {
  if (state.page === "publish") return publishView();
  return storeView();
}

function storeView() {
  const apps = state.catalog.apps || [];
  const demo = state.catalog.source !== "github";
  return `
    <section class="hero">
      <h1>Drop an APK.<br/>It ships as a GitHub Release.</h1>
      <p>Login, upload, done. The store indexes public repos tagged <code>netlify-apk-store</code>. Downloads come straight from GitHub — no extra hosting bill.</p>
      <div class="row">
        ${
          state.user
            ? `<button class="btn primary" id="go-publish">Publish your APK</button>`
            : `<button class="btn primary" id="do-login">Login with GitHub</button>`
        }
      </div>
    </section>
    ${demo ? `<div class="banner">Catalog is in preview/demo mode until this site is on Netlify with GitHub OAuth (and optional GITHUB_TOKEN for search rate limits).</div>` : ""}
    ${state.err ? `<div class="banner">OAuth error: ${escapeHtml(state.err)}</div>` : ""}
    <div class="grid">
      ${apps.map(card).join("") || `<p class="note">No apps yet. Be the first publish.</p>`}
    </div>
  `;
}

function card(app) {
  const rel = app.release || {};
  const size = rel.size ? formatBytes(rel.size) : "—";
  const dl = rel.apkUrl
    ? `<a class="btn primary" href="${rel.apkUrl}">Download APK</a>`
    : `<button class="btn" disabled>No APK yet</button>`;
  return `
    <article class="card">
      <h3>${escapeHtml(app.name)}</h3>
      <p>${escapeHtml(app.description || "")}</p>
      <div class="meta">
        <span class="pill">@${escapeHtml(app.owner)}</span>
        <span class="pill">${escapeHtml(rel.tag || "unreleased")}</span>
        <span class="pill">${rel.downloads ?? 0} dl</span>
        <span class="pill">${size}</span>
      </div>
      <div class="actions">
        ${dl}
        <a class="btn" href="${app.htmlUrl}" target="_blank" rel="noreferrer">Repo</a>
      </div>
    </article>
  `;
}

function publishView() {
  if (!state.user) {
    return `<div class="panel"><p>Login dulu.</p><button class="btn primary" id="do-login">Login with GitHub</button></div>`;
  }
  return `
    <div class="panel">
      <h2 style="margin:0 0 6px">Publish APK</h2>
      <p class="note">We create (or reuse) a public repo, tag it <code>netlify-apk-store</code>, open a Release, and upload the APK as an asset. File goes browser → GitHub, not through Netlify.</p>
      <label>App name</label>
      <input id="name" placeholder="Kopi Tracker" />
      <label>Version</label>
      <input id="version" placeholder="1.0.0" />
      <label>Package id (optional)</label>
      <input id="pkg" placeholder="id.kamu.app" />
      <label>Description</label>
      <textarea id="desc" rows="3" placeholder="What does it do?"></textarea>
      <label>APK file</label>
      <div class="drop" id="drop">Drop .apk here or click to choose</div>
      <input id="file" type="file" accept=".apk,application/vnd.android.package-archive" hidden />
      <div class="progress" hidden><i id="bar"></i></div>
      <p class="note" id="fname"></p>
      <button class="btn primary" id="submit" style="margin-top:16px">Publish to GitHub</button>
      <p id="status" class="note"></p>
    </div>
  `;
}

function bindPublish() {
  const drop = $("#drop");
  const fileInput = $("#file");
  if (!drop || !fileInput) return;
  let file = null;

  const setFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".apk")) {
      $("#status").innerHTML = `<span class="err">File must be .apk</span>`;
      return;
    }
    file = f;
    $("#fname").textContent = `${f.name} · ${formatBytes(f.size)}`;
  };

  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("hot");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("hot");
    setFile(e.dataTransfer.files[0]);
  });

  $("#submit").addEventListener("click", async () => {
    const name = $("#name").value.trim();
    const version = $("#version").value.trim();
    const description = $("#desc").value.trim();
    const packageId = $("#pkg").value.trim();
    const status = $("#status");
    if (!name || !version || !file) {
      status.innerHTML = `<span class="err">Name, version, and APK are required.</span>`;
      return;
    }
    const barWrap = document.querySelector(".progress");
    const bar = $("#bar");
    barWrap.hidden = false;
    status.textContent = "Talking to GitHub…";
    try {
      const result = await publishApk({
        token: state.token,
        user: state.user,
        name,
        description,
        version,
        packageId,
        file,
        onProgress: (n) => {
          bar.style.width = `${Math.round(n * 100)}%`;
          status.textContent = `Uploading ${Math.round(n * 100)}%`;
        },
      });
      status.innerHTML = `<span class="ok">Live as ${escapeHtml(result.tag)} on ${escapeHtml(result.repo)}. <a href="${result.htmlUrl}" target="_blank">Open release</a></span>`;
      await loadCatalog();
    } catch (e) {
      status.innerHTML = `<span class="err">${escapeHtml(e.message)}</span>`;
    }
  });
}

function $(sel) {
  return document.querySelector(sel);
}

function formatBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
