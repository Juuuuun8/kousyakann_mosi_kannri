import { derivePasswordVerifier, constantTimeTextEqual, normalizeLoginEmail, sessionCookie } from "../../auth-contracts/src/index.ts";
import { signRequest } from "../../transport-contracts/src/index.ts";

const JSON_LIMIT = 64 * 1024;
const GAS_RESPONSE_LIMIT = 2 * 1024 * 1024;
const SESSION_COOKIE = "session";
const PUBLIC_FAILURE = Object.freeze({ ok: false, code: "AUTHENTICATION_FAILED" });
const ROUTES = new Map<string, ReadonlySet<string>>([
  ["/api/auth/login", new Set(["POST"])],
  ["/api/auth/logout", new Set(["POST"])],
  ["/api/auth/change-password", new Set(["POST"])],
  ["/api/auth/reset", new Set(["POST"])],
  ["/api/register", new Set(["POST"])],
  ["/api/reports", new Set(["GET"])],
  ["/api/analytics/query", new Set(["POST"])],
  ["/api/export/ml", new Set(["POST"])],
]);

export interface GatewayDependencies {
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

interface GasResponse {
  readonly ok: boolean;
  readonly code: string;
  readonly data?: unknown;
}

interface Challenge {
  readonly salt: string;
  readonly verifier: string;
  readonly iterations: number;
  readonly stateVersion: string;
}

function json(value: unknown, status = 200, extra: HeadersInit = {}): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", ...extra } });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureRandom(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function cookie(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim();
  if (type !== "application/json") throw new Error("UNSUPPORTED_CONTENT_TYPE");
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > JSON_LIMIT) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > JSON_LIMIT) throw new Error("BODY_TOO_LARGE");
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("INVALID_JSON_OBJECT");
  return value as Record<string, unknown>;
}

async function gasCall(env: Env, operation: string, body: unknown, deps: GatewayDependencies): Promise<GasResponse> {
  if (!env.GAS_ENDPOINT.startsWith("https://script.google.com/")) throw new Error("GAS_ENDPOINT_INVALID");
  const now = deps.now?.() ?? Date.now();
  const nonce = base64Url((deps.randomBytes ?? secureRandom)(24));
  const bodyText = JSON.stringify({ operation, body });
  const encodedSecret = new TextEncoder().encode(env.GAS_HMAC_SECRET);
  const secret = new Uint8Array(encodedSecret.byteLength);
  secret.set(encodedSecret);
  const signed = await signRequest({ method: "POST", path: `/internal/${operation}`, timestamp: String(now), nonce, bodyText }, secret);
  const response = await (deps.fetcher ?? fetch)(env.GAS_ENDPOINT, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(signed),
  });
  const length = Number(response.headers.get("Content-Length") ?? "0");
  if (!response.ok || length > GAS_RESPONSE_LIMIT) throw new Error("GAS_UNAVAILABLE");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > GAS_RESPONSE_LIMIT) throw new Error("GAS_RESPONSE_TOO_LARGE");
  const result: unknown = JSON.parse(text);
  if (typeof result !== "object" || result === null || typeof (result as { ok?: unknown }).ok !== "boolean" || typeof (result as { code?: unknown }).code !== "string") throw new Error("GAS_RESPONSE_INVALID");
  return result as GasResponse;
}

async function login(request: Request, env: Env, deps: GatewayDependencies): Promise<Response> {
  const input = await boundedJson(request);
  if (typeof input.email !== "string" || typeof input.password !== "string") return json(PUBLIC_FAILURE, 401);
  const email = normalizeLoginEmail(input.email);
  if (email !== input.email || input.password.length < 15 || input.password.length > 128) return json(PUBLIC_FAILURE, 401);
  const challengeResult = await gasCall(env, "auth.challenge", { email }, deps);
  if (!challengeResult.ok || typeof challengeResult.data !== "object" || challengeResult.data === null) return json(PUBLIC_FAILURE, 401);
  const challenge = challengeResult.data as Partial<Challenge>;
  if (typeof challenge.salt !== "string" || typeof challenge.verifier !== "string" || typeof challenge.iterations !== "number" || typeof challenge.stateVersion !== "string") throw new Error("AUTH_CHALLENGE_INVALID");
  const candidate = await derivePasswordVerifier(input.password, challenge.salt, challenge.iterations, env.PASSWORD_PEPPER);
  const matched = constantTimeTextEqual(candidate, challenge.verifier);
  const token = base64Url((deps.randomBytes ?? secureRandom)(32));
  const result = await gasCall(env, "auth.complete", { email, stateVersion: challenge.stateVersion, matched, sessionHash: await sha256(token) }, deps);
  if (!result.ok || !matched) return json(PUBLIC_FAILURE, 401);
  return json({ ok: true, code: result.code, data: result.data }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function relay(request: Request, env: Env, deps: GatewayDependencies): Promise<Response> {
  const url = new URL(request.url);
  const session = cookie(request);
  if (!session) return json({ ok: false, code: "UNAUTHENTICATED" }, 401);
  const body = request.method === "GET" ? Object.fromEntries(url.searchParams) : await boundedJson(request);
  const result = await gasCall(env, `api.${url.pathname.slice(5).replaceAll("/", ".")}`, { sessionHash: await sha256(session), payload: body }, deps);
  const status = result.ok ? 200 : result.code === "FORBIDDEN" ? 403 : result.code === "UNAUTHENTICATED" ? 401 : 400;
  const headers: HeadersInit = url.pathname === "/api/auth/logout" && result.ok ? { "Set-Cookie": "session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" } : {};
  return json(result, status, headers);
}

export async function handleGatewayRequest(request: Request, env: Env, deps: GatewayDependencies = {}): Promise<Response> {
  try {
    const url = new URL(request.url);
    const methods = ROUTES.get(url.pathname);
    if (!methods) return json({ ok: false, code: "NOT_FOUND" }, 404);
    if (!methods.has(request.method)) return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, { Allow: [...methods].join(", ") });
    if (url.pathname === "/api/auth/login") return await login(request, env, deps);
    return await relay(request, env, deps);
  } catch (error) {
    const code = error instanceof SyntaxError ? "INVALID_JSON" : error instanceof Error && ["BODY_TOO_LARGE", "UNSUPPORTED_CONTENT_TYPE", "INVALID_JSON_OBJECT"].includes(error.message) ? error.message : "INTERNAL_ERROR";
    return json({ ok: false, code }, code === "INTERNAL_ERROR" ? 502 : 400);
  }
}
