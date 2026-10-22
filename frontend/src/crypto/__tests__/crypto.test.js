/**
 * Crypto module tests — Node built-in test runner.
 * Run with: node --test src/crypto/__tests__/crypto.test.js
 *
 * These tests run in Node.js, which has crypto.subtle available from v19+.
 * For older Node, a polyfill or --experimental-global-webcrypto flag may be needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Polyfill Web Crypto for Node.js (available natively in Node 19+)
// ---------------------------------------------------------------------------
import { webcrypto } from "node:crypto";
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto;
}

import {
  p,
  g,
  modPow,
  generateKeyPair,
  computeSharedSecret,
  bigIntToBytes,
  bytesToHex,
  hexToBytes
} from "../dh.js";

import { deriveKey, keyFingerprint, encryptMessage, decryptMessage } from "../ciphers.js";

// ---------------------------------------------------------------------------
// 1. Prime p has 2048 bits and correct top/bottom 64 bits
// ---------------------------------------------------------------------------
describe("DH prime validation", () => {
  it("prime p has exactly 2048 bits", () => {
    const hex = p.toString(16);
    // 2048 bits = 256 bytes = 512 hex chars
    assert.equal(hex.length, 512, `Expected 512 hex chars, got ${hex.length}`);
    // Leading bit must be 1 (most significant nibble must be f)
    assert.equal(hex[0], "f", `Top nibble should be 'f', got '${hex[0]}'`);
  });

  it("top 64 bits (first 16 hex chars) are all 1s", () => {
    const hex = p.toString(16);
    const top64 = hex.slice(0, 16);
    assert.equal(top64, "ffffffffffffffff", `Top 64 bits: ${top64}`);
  });

  it("bottom 64 bits (last 16 hex chars) are all 1s", () => {
    const hex = p.toString(16);
    const bottom64 = hex.slice(-16);
    assert.equal(bottom64, "ffffffffffffffff", `Bottom 64 bits: ${bottom64}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Two key pairs compute identical shared secrets
// ---------------------------------------------------------------------------
describe("DH shared secret", () => {
  it("shared secrets match on both sides", () => {
    const pairA = generateKeyPair();
    const pairB = generateKeyPair();

    const secretA = computeSharedSecret(pairA.privateHex, pairB.publicHex);
    const secretB = computeSharedSecret(pairB.privateHex, pairA.publicHex);

    assert.equal(secretA, secretB, "Shared secrets should be identical");
  });

  it("shared secrets are large numbers (> 2^100)", () => {
    const pairA = generateKeyPair();
    const pairB = generateKeyPair();
    const secret = computeSharedSecret(pairA.privateHex, pairB.publicHex);
    assert.ok(secret > 2n ** 100n, "Shared secret should be a large number");
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid partner public keys are rejected
// ---------------------------------------------------------------------------
describe("DH partner public key validation", () => {
  it("rejects partnerPublic = 0", () => {
    const pair = generateKeyPair();
    const zeroHex = "0";
    assert.throws(
      () => computeSharedSecret(pair.privateHex, zeroHex),
      /invalid partner public key/i
    );
  });

  it("rejects partnerPublic = 1", () => {
    const pair = generateKeyPair();
    const oneHex = "1";
    assert.throws(
      () => computeSharedSecret(pair.privateHex, oneHex),
      /invalid partner public key/i
    );
  });

  it("rejects partnerPublic = p-1", () => {
    const pair = generateKeyPair();
    const pMinus1Hex = (p - 1n).toString(16);
    assert.throws(
      () => computeSharedSecret(pair.privateHex, pMinus1Hex),
      /invalid partner public key/i
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Caesar cipher round trips
// ---------------------------------------------------------------------------
describe("Caesar cipher", () => {
  // Create a deterministic master key for testing
  const masterKey = new Uint8Array(32).fill(42); // shift = (42 % 94) + 1 = 43

  it("round trip: plain English", async () => {
    const plaintext = "Hello, World!";
    const { text } = await encryptMessage({ plaintext, cipher: "caesar", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "caesar", nonce: null, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: digits and symbols", async () => {
    const plaintext = "1234567890!@#$%^&*()";
    const { text } = await encryptMessage({ plaintext, cipher: "caesar", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "caesar", nonce: null, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: leading and trailing spaces", async () => {
    const plaintext = "   spaces   ";
    const { text } = await encryptMessage({ plaintext, cipher: "caesar", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "caesar", nonce: null, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: empty string", async () => {
    const plaintext = "";
    const { text } = await encryptMessage({ plaintext, cipher: "caesar", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "caesar", nonce: null, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("emoji and non-ASCII pass through unchanged (not shifted)", async () => {
    const plaintext = "Hello 👋 Wörld";
    const { text: ciphertext } = await encryptMessage({ plaintext, cipher: "caesar", masterKey });
    // The emoji 👋 should appear verbatim in the ciphertext
    assert.ok(ciphertext.includes("👋"), "Emoji should pass through unchanged in ciphertext");
    // And the ö should also pass through
    assert.ok(ciphertext.includes("ö"), "Non-ASCII char ö should pass through");
    // Round trip should still work
    const decrypted = await decryptMessage({ text: ciphertext, cipher: "caesar", nonce: null, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("ciphertext differs from plaintext (encryption is happening)", async () => {
    const plaintext = "ABCDE";
    const { text } = await encryptMessage({ plaintext, cipher: "caesar", masterKey });
    assert.notEqual(text, plaintext);
  });
});

// ---------------------------------------------------------------------------
// 5. Vernam cipher round trips
// ---------------------------------------------------------------------------
describe("Vernam cipher", () => {
  const masterKey = new Uint8Array(32).fill(7);

  it("round trip: ASCII text", async () => {
    const plaintext = "Hello, Vernam!";
    const { text, nonce } = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "vernam", nonce, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: emoji", async () => {
    const plaintext = "🔒🔑💬";
    const { text, nonce } = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "vernam", nonce, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: multilingual text", async () => {
    const plaintext = "日本語 العربية Ελληνικά";
    const { text, nonce } = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "vernam", nonce, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: message longer than 32 bytes (multi-block keystream)", async () => {
    const plaintext = "This message is definitely longer than thirty-two bytes for testing.";
    assert.ok(new TextEncoder().encode(plaintext).length > 32);
    const { text, nonce } = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "vernam", nonce, masterKey });
    assert.equal(decrypted, plaintext);
  });

  it("round trip: message longer than 1000 bytes", async () => {
    const plaintext = "A".repeat(1001);
    const { text, nonce } = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    const decrypted = await decryptMessage({ text, cipher: "vernam", nonce, masterKey });
    assert.equal(decrypted, plaintext);
  });
});

// ---------------------------------------------------------------------------
// 6. Vernam: same plaintext twice yields different ciphertext
// ---------------------------------------------------------------------------
describe("Vernam nonce uniqueness", () => {
  it("encrypting same plaintext twice yields different ciphertext", async () => {
    const masterKey = new Uint8Array(32).fill(99);
    const plaintext = "identical message";
    const result1 = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    const result2 = await encryptMessage({ plaintext, cipher: "vernam", masterKey });
    assert.notEqual(result1.text, result2.text, "Different nonces should yield different ciphertext");
    assert.notEqual(result1.nonce, result2.nonce, "Nonces should be different");
  });
});

// ---------------------------------------------------------------------------
// 7. Wrong master key yields different plaintext
// ---------------------------------------------------------------------------
describe("Key mismatch", () => {
  it("Vernam: decrypting with wrong key does not return original plaintext", async () => {
    const masterKey1 = new Uint8Array(32).fill(11);
    const masterKey2 = new Uint8Array(32).fill(22);
    const plaintext = "secret message";
    const { text, nonce } = await encryptMessage({ plaintext, cipher: "vernam", masterKey: masterKey1 });
    const wrongDecrypt = await decryptMessage({ text, cipher: "vernam", nonce, masterKey: masterKey2 });
    assert.notEqual(wrongDecrypt, plaintext, "Wrong key should not decrypt correctly");
  });

  it("Caesar: decrypting with wrong key does not return original plaintext", async () => {
    const masterKey1 = new Uint8Array(32).fill(5);
    const masterKey2 = new Uint8Array(32).fill(50);
    const plaintext = "secret message";
    const { text } = await encryptMessage({ plaintext, cipher: "caesar", masterKey: masterKey1 });
    const wrongDecrypt = await decryptMessage({ text, cipher: "caesar", nonce: null, masterKey: masterKey2 });
    assert.notEqual(wrongDecrypt, plaintext, "Wrong key should not decrypt correctly");
  });
});

// ---------------------------------------------------------------------------
// 8. Fingerprints match on both sides of a DH exchange
// ---------------------------------------------------------------------------
describe("Key fingerprint", () => {
  it("both sides of a DH exchange compute the same fingerprint", async () => {
    const pairA = generateKeyPair();
    const pairB = generateKeyPair();

    const secretA = computeSharedSecret(pairA.privateHex, pairB.publicHex);
    const secretB = computeSharedSecret(pairB.privateHex, pairA.publicHex);

    const keyA = await deriveKey(secretA);
    const keyB = await deriveKey(secretB);

    const fpA = await keyFingerprint(keyA);
    const fpB = await keyFingerprint(keyB);

    assert.equal(fpA, fpB, "Fingerprints must match on both sides");
  });

  it("fingerprint has the format 'xxxx xxxx xxxx xxxx'", async () => {
    const key = new Uint8Array(32).fill(1);
    const fp = await keyFingerprint(key);
    assert.match(fp, /^[0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4}$/);
  });
});
