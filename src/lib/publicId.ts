/**
 * Opaque public ids: 11 chars from [A-Za-z0-9] (letters and digits only).
 * Rejection sampling keeps generation unbiased (256 % 62 !== 0).
 */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const ALPHABET_LEN = ALPHABET.length;
/** Largest multiple of ALPHABET_LEN that fits in a byte. */
const MAX_UNBIASED = Math.floor(256 / ALPHABET_LEN) * ALPHABET_LEN;

export const PUBLIC_ID_LENGTH = 11;

/** Generate a new opaque public id (e.g. `Jg7YL6N5bOs`). */
export function generatePublicId(): string {
  let out = "";
  while (out.length < PUBLIC_ID_LENGTH) {
    const bytes = new Uint8Array(PUBLIC_ID_LENGTH - out.length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b >= MAX_UNBIASED) continue;
      out += ALPHABET[b % ALPHABET_LEN];
      if (out.length === PUBLIC_ID_LENGTH) break;
    }
  }
  return out;
}

/** True when `value` looks like a generated public id (not a local draft / ObjectId). */
export function isPublicIdFormat(value: string): boolean {
  if (value.length !== PUBLIC_ID_LENGTH) return false;
  for (let i = 0; i < value.length; i++) {
    if (!ALPHABET.includes(value[i]!)) return false;
  }
  return true;
}
