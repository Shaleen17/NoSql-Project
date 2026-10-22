/**
 * Caesar cipher, Vernam cipher, and key derivation.
 *
 * Key derivation uses the Web Crypto API (SHA-256 only).
 * Cipher algorithms themselves are implemented by hand — no crypto library.
 *
 * LIMITATION — Caesar cipher:
 *   Only printable ASCII characters (code points 32–126) are shifted.
 *   Emoji, non-English characters, and newlines pass through unchanged.
 *   This means ciphertext may contain a mix of shifted ASCII and raw Unicode.
 *   Recipients must have the same master key to recover the original text.
 *
 * LIMITATION — Vernam cipher:
 *   This is a stream-cipher built from a SHA-256-derived keystream (not a
 *   true one-time pad, which would require a purely random key as long as
 *   the message). The security relies on SHA-256 acting as a PRF.
 *   TWO-TIME-PAD PROBLEM: If the same nonce were ever reused with the same
 *   master key, XOR-ing the two ciphertexts would cancel the keystream and
 *   expose the XOR of the two plaintexts. Always generate a fresh nonce
 *   per message. This implementation uses crypto.getRandomValues for that.
 */

import { bigIntToBytes } from "./dh.js";

// ---------------------------------------------------------------------------
// Key derivation
// masterKey (32 bytes) = SHA-256( utf8("chatflow-dh-v1") || sharedSecretBytes )
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derive a 32-byte master key from a DH shared secret BigInt.
 * @param {BigInt} sharedSecretBigInt
 * @returns {Promise<Uint8Array>} 32-byte master key
 */
export async function deriveKey(sharedSecretBigInt) {
  const prefix = encoder.encode("chatflow-dh-v1");
  const secretBytes = bigIntToBytes(sharedSecretBigInt); // 256 bytes, big-endian

  const combined = new Uint8Array(prefix.length + secretBytes.length);
  combined.set(prefix, 0);
  combined.set(secretBytes, prefix.length);

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return new Uint8Array(hashBuffer);
}

/**
 * Compute a short fingerprint of a key for visual comparison.
 * Returns first 16 hex chars of SHA-256(bytes), grouped as "xxxx xxxx xxxx xxxx".
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function keyFingerprint(bytes) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)} ${hex.slice(8, 12)} ${hex.slice(12, 16)}`;
}

// ---------------------------------------------------------------------------
// Caesar cipher
// Shift is derived from masterKey[0]: shift = (masterKey[0] % 94) + 1
// Valid shift range: 1..94. Operates on printable ASCII 32..126 (modulo 95).
// Characters outside that range (emoji, non-ASCII, newlines) pass through.
// Iteration is over code points (Array.from) so multi-byte emoji are not split.
// ---------------------------------------------------------------------------

function caesarShift(masterKey) {
  return (masterKey[0] % 94) + 1;
}

function caesarEncryptChar(codePoint, shift) {
  if (codePoint >= 32 && codePoint <= 126) {
    return ((codePoint - 32 + shift) % 95) + 32;
  }
  return codePoint; // non-ASCII / out-of-range: pass through
}

function caesarDecryptChar(codePoint, shift) {
  if (codePoint >= 32 && codePoint <= 126) {
    return ((codePoint - 32 - shift + 95 * Math.ceil(shift / 95)) % 95) + 32;
  }
  return codePoint;
}

function caesarEncrypt(plaintext, masterKey) {
  const shift = caesarShift(masterKey);
  return Array.from(plaintext)
    .map((char) => String.fromCodePoint(caesarEncryptChar(char.codePointAt(0), shift)))
    .join("");
}

function caesarDecrypt(ciphertext, masterKey) {
  const shift = caesarShift(masterKey);
  return Array.from(ciphertext)
    .map((char) => String.fromCodePoint(caesarDecryptChar(char.codePointAt(0), shift)))
    .join("");
}

// ---------------------------------------------------------------------------
// Vernam cipher (stream-cipher using SHA-256-derived keystream)
// Keystream block i = SHA-256( masterKey || nonce || counter_4_bytes_big_endian )
// Plaintext → UTF-8 bytes → XOR with keystream → lowercase hex string
// Nonce: 12 random bytes, stored as 24-char hex string alongside the message.
// ---------------------------------------------------------------------------

async function buildKeystream(masterKey, nonceBytes, length) {
  const blocks = [];
  let counter = 0;
  let total = 0;

  while (total < length) {
    const counterBytes = new Uint8Array(4);
    counterBytes[0] = (counter >>> 24) & 0xff;
    counterBytes[1] = (counter >>> 16) & 0xff;
    counterBytes[2] = (counter >>> 8) & 0xff;
    counterBytes[3] = counter & 0xff;

    const input = new Uint8Array(masterKey.length + nonceBytes.length + 4);
    input.set(masterKey, 0);
    input.set(nonceBytes, masterKey.length);
    input.set(counterBytes, masterKey.length + nonceBytes.length);

    const hashBuf = await crypto.subtle.digest("SHA-256", input);
    const block = new Uint8Array(hashBuf);
    blocks.push(block);
    total += block.length;
    counter++;
  }

  // Concatenate and truncate
  const keystream = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    keystream.set(block, offset);
    offset += block.length;
  }
  return keystream.slice(0, length);
}

async function vernamEncrypt(plaintext, masterKey) {
  const plaintextBytes = encoder.encode(plaintext);

  // Generate fresh 12-byte nonce (see two-time-pad note at top of file)
  const nonceBytes = new Uint8Array(12);
  crypto.getRandomValues(nonceBytes);
  const nonceHex = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const keystream = await buildKeystream(masterKey, nonceBytes, plaintextBytes.length);

  const ciphertextBytes = plaintextBytes.map((byte, i) => byte ^ keystream[i]);
  const ciphertextHex = Array.from(ciphertextBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { ciphertextHex, nonceHex };
}

async function vernamDecrypt(ciphertextHex, nonceHex, masterKey) {
  // hex → bytes
  const ciphertextBytes = new Uint8Array(ciphertextHex.length / 2);
  for (let i = 0; i < ciphertextBytes.length; i++) {
    ciphertextBytes[i] = parseInt(ciphertextHex.slice(i * 2, i * 2 + 2), 16);
  }

  const nonceBytes = new Uint8Array(nonceHex.length / 2);
  for (let i = 0; i < nonceBytes.length; i++) {
    nonceBytes[i] = parseInt(nonceHex.slice(i * 2, i * 2 + 2), 16);
  }

  const keystream = await buildKeystream(masterKey, nonceBytes, ciphertextBytes.length);

  const plaintextBytes = ciphertextBytes.map((byte, i) => byte ^ keystream[i]);
  return decoder.decode(plaintextBytes);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext message.
 * @param {{ plaintext: string, cipher: "caesar"|"vernam", masterKey: Uint8Array }}
 * @returns {Promise<{ text: string, cipher: string, nonce: string|null }>}
 */
export async function encryptMessage({ plaintext, cipher, masterKey }) {
  if (cipher === "caesar") {
    const text = caesarEncrypt(plaintext, masterKey);
    return { text, cipher: "caesar", nonce: null };
  }

  if (cipher === "vernam") {
    const { ciphertextHex, nonceHex } = await vernamEncrypt(plaintext, masterKey);
    return { text: ciphertextHex, cipher: "vernam", nonce: nonceHex };
  }

  throw new Error(`Unknown cipher: ${cipher}`);
}

/**
 * Decrypt a ciphertext message.
 * @param {{ text: string, cipher: "caesar"|"vernam", nonce: string|null, masterKey: Uint8Array }}
 * @returns {Promise<string>} plaintext
 */
export async function decryptMessage({ text, cipher, nonce, masterKey }) {
  if (cipher === "caesar") {
    return caesarDecrypt(text, masterKey);
  }

  if (cipher === "vernam") {
    if (!nonce) throw new Error("Vernam cipher requires a nonce");
    return vernamDecrypt(text, nonce, masterKey);
  }

  throw new Error(`Unknown cipher: ${cipher}`);
}
