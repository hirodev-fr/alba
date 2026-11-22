declare module "h3" {
  interface H3EventContext {
    cloudflare?: {
      env: { API?: { fetch: (request: Request) => Promise<Response> } };
    };
  }
}
