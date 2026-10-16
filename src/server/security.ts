export function localRequest(request: Request) {
  const url = new URL(request.url), host = request.headers.get("host")?.split(":")[0];
  const allowed = ["localhost", "127.0.0.1", "[::1]"];
  if (!allowed.includes(host ?? "") || !allowed.includes(url.hostname)) return false;
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}
