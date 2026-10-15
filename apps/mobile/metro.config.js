// Metro config. Expo detects the pnpm workspace on its own; the only addition is a dev-only
// proxy so the web build talks to the API on the same origin, exactly as in production
// (where the API server serves the web build). Native dev builds use EXPO_PUBLIC_API_URL.
const http = require("node:http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const apiTarget = new URL(process.env.API_DEV_URL ?? "http://localhost:3000");

// `enhanceMiddleware` is deprecated in Metro but still honoured by Expo CLI. If it is ever
// removed, run web dev with EXPO_PUBLIC_API_URL and CORS on the API instead.
config.server.enhanceMiddleware = (metroMiddleware) => (req, res, next) => {
  if (!req.url?.startsWith("/api/")) return metroMiddleware(req, res, next);
  const upstream = http.request(
    {
      hostname: apiTarget.hostname,
      port: apiTarget.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: apiTarget.host },
    },
    (apiRes) => {
      res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
      apiRes.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "api_unreachable" } }));
  });
  req.pipe(upstream);
};

module.exports = config;
