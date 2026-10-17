// Adds the over-the-air update URL to app.json. It lives on the same server as the API
// (docs/OPERATIONS.md#over-the-air-updates), so it follows EXPO_PUBLIC_API_URL.
module.exports = ({ config }) => {
  const origin = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  return {
    ...config,
    updates: {
      ...config.updates,
      ...(origin ? { url: `${origin}/api/ota/manifest` } : { enabled: false }),
    },
  };
};
