// Build variants (docs/adr/0020-build-variants.md). APP_VARIANT picks one at build time:
//   production  the club's app: prod server only, no tester tools (the store listing)
//   tester      (default) own package and name, installs next to production, staging only
// EXPO_PUBLIC_API_URL is the server that variant talks to. The over-the-air update URL lives on
// that same server, which serves only the bundle built for its own variant, so a variant only
// ever receives JavaScript wired to its own server (docs/OPERATIONS.md#over-the-air-updates).
const VARIANTS = {
  production: {
    name: "SFF RSC",
    id: "pt.realsportmassama.companion",
    scheme: "rsc",
  },
  tester: {
    name: "SFF RSC Teste",
    id: "pt.realsportmassama.companion.teste",
    scheme: "rsc-teste",
  },
};

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT === "production" ? "production" : "tester";
  const { name, id, scheme } = VARIANTS[variant];
  const origin = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  return {
    ...config,
    name,
    scheme,
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...config.android, package: id },
    updates: {
      ...config.updates,
      ...(origin ? { url: `${origin}/api/ota/manifest` } : { enabled: false }),
    },
  };
};
