const TOPIC = "netlify-apk-store";
const GH = "https://api.github.com";

export function tokenFromHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get("token");
  const error = hash.get("error");
  if (error) sessionStorage.setItem("apkstore_error", error);
  if (token) {
    sessionStorage.setItem("apkstore_token", token);
    history.replaceState(null, "", location.pathname + location.search);
  }
  return sessionStorage.getItem("apkstore_token");
}

export function logout() {
  sessionStorage.removeItem("apkstore_token");
}

export async function gh(path, token, opts = {}) {
  const res = await fetch(`${GH}${path}`, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.method || "GET"} ${path} → ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function me(token) {
  return gh("/user", token);
}

export async function publishApk({ token, user, name, description, version, packageId, file, onProgress }) {
  const repoName = slug(name);
  let repo;
  try {
    repo = await gh(`/repos/${user.login}/${repoName}`, token);
  } catch {
    repo = await gh("/user/repos", token, {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        description: description || `${name} — published via APKstore`,
        auto_init: true,
        has_issues: false,
        has_projects: false,
        has_wiki: false,
      }),
    });
  }

  await gh(`/repos/${repo.full_name}/topics`, token, {
    method: "PUT",
    headers: { Accept: "application/vnd.github.mercy-preview+json" },
    body: JSON.stringify({ names: [TOPIC, "android", "apk"] }),
  });

  const meta = {
    name,
    description,
    packageId: packageId || null,
    publisher: user.login,
  };
  await putFile(token, repo.full_name, "apkstore.json", JSON.stringify(meta, null, 2) + "\n");

  const tag = version.startsWith("v") ? version : `v${version}`;
  const release = await gh(`/repos/${repo.full_name}/releases`, token, {
    method: "POST",
    body: JSON.stringify({
      tag_name: tag,
      name: `${name} ${tag}`,
      body: description || `Android build ${tag}`,
      draft: false,
      prerelease: false,
    }),
  });

  const assetName = file.name.toLowerCase().endsWith(".apk")
    ? file.name
    : `${repoName}.apk`;
  await uploadAsset(token, release.upload_url, file, assetName, onProgress);

  return {
    repo: repo.full_name,
    htmlUrl: release.html_url,
    tag,
  };
}

async function putFile(token, fullName, path, content) {
  let sha;
  try {
    const existing = await gh(`/repos/${fullName}/contents/${path}`, token);
    sha = existing.sha;
  } catch {
    sha = undefined;
  }
  await gh(`/repos/${fullName}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message: sha ? `chore: update ${path}` : `chore: add ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      sha,
    }),
  });
}

function uploadAsset(token, uploadUrl, file, name, onProgress) {
  const url = uploadUrl.replace("{?name,label}", "") + `?name=${encodeURIComponent(name)}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/vnd.android.package-archive");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`upload ${xhr.status}: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading APK"));
    xhr.send(file);
  });
}

function slug(name) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "apk-app";
}
