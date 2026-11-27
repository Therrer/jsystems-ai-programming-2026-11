// ADR-000 TAC-02: unit, component and integration tests never call real external services.
// Mocked external responses must come from recorded captures (plan §4, capture policy).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Network access blocked in tests: ${url.hostname}`);
  }
  return realFetch(input, init);
}) as typeof fetch;
