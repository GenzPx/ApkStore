const TOKEN = "https://github.com/login/oauth/access_token";

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = req.headers.get("cookie") || "";
  const expected = cookie.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
  const origin = originFrom(req, url);

  if (!code || !state || !expected || state !== expected) {
    return Response.redirect(`${origin}/#error=oauth_state`, 302);
  }

  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !secret) {
    return Response.redirect(`${origin}/#error=oauth_not_configured`, 302);
  }

  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: `${origin}/api/oauth-callback`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    return Response.redirect(`${origin}/#error=oauth_exchange`, 302);
  }

  const dest = `${origin}/#token=${encodeURIComponent(data.access_token)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: dest,
      "Set-Cookie": "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
};

function originFrom(req, url) {
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || url.host;
  return `${proto}://${host}`;
}
