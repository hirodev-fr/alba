export default defineEventHandler(async (event) => {
  const api = event.context.cloudflare?.env?.API;
  if (!api) {
    throw createError({
      statusCode: 503,
      statusMessage: "API binding unavailable",
    });
  }

  const url = getRequestURL(event);
  // Keep the public origin and headers (including cookies) for authentication.
  url.pathname = url.pathname.slice("/api".length) || "/";
  const request = toWebRequest(event);
  const response = await api.fetch(new Request(url, request));
  return sendWebResponse(event, response);
});
