const AUTH = "https://github.com/login/oauth/authorize";

export default async (req) => {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) {
    return json({ error: "GITHUB_CLIENT_ID is not set on Netlify." }, 500);
  }
  const url = new URL(req.url);
  const origin = originFrom(req, url);
  const redirect = `${origin}/api/oauth-callback`;
  const state = crypto.randomUUID();
  const gh = new URL(AUTH);
  gh.searchParams.set("client_id", id);
  gh.searchParams.set("redirect_uri", redirect);
  gh.searchParams.set("scope", "public_repo read:user");
  gh.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};

function originFrom(req, url) {
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || url.host;
  return `${proto}://${host}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
