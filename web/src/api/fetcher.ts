// Custom fetch mutator used by the Orval-generated client.
// Orval calls it as customFetch<T>(url, requestInit); query params are already
// baked into `url`. The browser always reaches the API on the host's mapped
// port; override with VITE_API_URL at build time if the API lives elsewhere.
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export async function customFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, options);
  if (!res.ok) {
    throw new Error(`${options?.method ?? "GET"} ${url} failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export default customFetch;
