import "server-only";
import { SLUG_LENGTH } from "@/features/links/schema";

export const SLUG_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Largest multiple of the alphabet size that fits in a byte (62 * 4). Bytes at
// or above it would make some characters likelier, so they are discarded.
const BYTE_LIMIT = 248;
const BATCH_SIZE = 16;

export function generateSlug(): string {
  let slug = "";
  while (slug.length < SLUG_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(BATCH_SIZE));
    for (const byte of bytes) {
      if (byte >= BYTE_LIMIT) continue;
      slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
      if (slug.length === SLUG_LENGTH) break;
    }
  }
  return slug;
}
