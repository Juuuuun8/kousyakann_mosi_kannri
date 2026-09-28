import { PASSWORD_POLICY } from "./constants.ts";
import { validatePasswordValue } from "./validation.ts";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function generatePasswordSalt(): string {
  const salt = new Uint8Array(PASSWORD_POLICY.saltBytes);
  crypto.getRandomValues(salt);
  return toBase64Url(salt);
}

export async function derivePasswordVerifier(password: string, saltBase64Url: string, iterations: number = PASSWORD_POLICY.pbkdf2Iterations, pepper = ""): Promise<string> {
  const validation = validatePasswordValue(password);
  if (!validation.ok) throw new Error(validation.issues[0]?.message ?? "password is invalid");
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) throw new Error("password iterations are outside the supported range");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}\u0000${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64Url(saltBase64Url),
      iterations,
    },
    keyMaterial,
    PASSWORD_POLICY.verifierBytes * 8,
  );
  return toBase64Url(new Uint8Array(bits));
}

export function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
