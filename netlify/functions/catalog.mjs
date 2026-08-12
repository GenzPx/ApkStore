const TOPIC = "netlify-apk-store";

export default async () => {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "apkstore",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const search = await fetch(
      `https://api.github.com/search/repositories?q=topic:${TOPIC}&sort=updated&per_page=30`,
      { headers }
    );
    if (!search.ok) {
      return json({ apps: demo(), source: "demo", reason: `search ${search.status}` });
    }
    const body = await search.json();
    const apps = [];
    for (const repo of body.items || []) {
      const app = await hydrate(repo, headers);
      if (app) apps.push(app);
    }
    return json({ apps: apps.length ? apps : demo(), source: apps.length ? "github" : "demo" });
  } catch (e) {
    return json({ apps: demo(), source: "demo", reason: String(e) });
  }
};

async function hydrate(repo, headers) {
  let meta = {
    name: repo.name,
    description: repo.description || "",
    slug: repo.full_name,
  };
  const file = await fetch(
    `https://api.github.com/repos/${repo.full_name}/contents/apkstore.json`,
    { headers }
  );
  if (file.ok) {
    const payload = await file.json();
    try {
      const parsed = JSON.parse(atob(payload.content.replace(/\n/g, "")));
      meta = { ...meta, ...parsed };
    } catch {
      /* keep defaults */
    }
  }

  const rel = await fetch(
    `https://api.github.com/repos/${repo.full_name}/releases/latest`,
    { headers }
  );
  let release = null;
  if (rel.ok) {
    const r = await rel.json();
    const apk = (r.assets || []).find((a) => a.name.toLowerCase().endsWith(".apk"));
    release = {
      tag: r.tag_name,
      name: r.name,
      publishedAt: r.published_at,
      downloads: (r.assets || []).reduce((n, a) => n + (a.download_count || 0), 0),
      apkUrl: apk?.browser_download_url || null,
      apkName: apk?.name || null,
      size: apk?.size || 0,
    };
  }

  return {
    name: meta.name || repo.name,
    description: meta.description || repo.description || "",
    owner: repo.owner.login,
    avatar: repo.owner.avatar_url,
    repo: repo.full_name,
    htmlUrl: repo.html_url,
    stars: repo.stargazers_count,
    updated: repo.updated_at,
    icon: meta.icon || null,
    packageId: meta.packageId || null,
    release,
  };
}

function demo() {
  return [
    {
      name: "Night Market",
      description: "Sample listing — deploy with GitHub OAuth to see real APKs.",
      owner: "demo",
      avatar: "",
      repo: "demo/night-market",
      htmlUrl: "https://github.com",
      stars: 12,
      updated: new Date().toISOString(),
      icon: null,
      packageId: "id.demo.nightmarket",
      release: {
        tag: "v1.0.0",
        name: "v1.0.0",
        publishedAt: new Date().toISOString(),
        downloads: 240,
        apkUrl: null,
        apkName: "night-market.apk",
        size: 18_400_000,
      },
    },
    {
      name: "Kopi Tracker",
      description: "Track your caffeine. This card is placeholder data for local preview.",
      owner: "demo",
      avatar: "",
      repo: "demo/kopi-tracker",
      htmlUrl: "https://github.com",
      stars: 4,
      updated: new Date().toISOString(),
      icon: null,
      packageId: "id.demo.kopi",
      release: {
        tag: "v0.3.2",
        name: "v0.3.2",
        publishedAt: new Date().toISOString(),
        downloads: 81,
        apkUrl: null,
        apkName: "kopi.apk",
        size: 9_200_000,
      },
    },
  ];
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });
}
