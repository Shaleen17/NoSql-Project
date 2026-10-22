/**
 * Diffie-Hellman key exchange — RFC 3526 2048-bit MODP Group 14.
 * Implemented manually with BigInt (square-and-multiply).
 * No crypto library is used for DH itself.
 *
 * Only crypto.getRandomValues (Web Crypto) is used for secure random bytes.
 */

// ---------------------------------------------------------------------------
// RFC 3526 Group 14 — 2048-bit MODP prime (section 3)
// https://www.rfc-editor.org/rfc/rfc3526#section-3
// ---------------------------------------------------------------------------
const GROUP14_PRIME_HEX =
  "ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd1" +
  "29024e088a67cc74020bbea63b139b22514a08798e3404dd" +
  "ef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245" +
  "e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7ed" +
  "ee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3d" +
  "c2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f" +
  "83655d23dca3ad961c62f356208552bb9ed529077096966d" +
  "670c354e4abc9804f1746c08ca18217c32905e462e36ce3b" +
  "e39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9" +
  "de2bcbf6955817183995497cea956ae515d2261898fa0510" +
  "15728e5a8aacaa68ffffffffffffffff";

export const p = BigInt("0x" + GROUP14_PRIME_HEX);
export const g = 2n;

// ---------------------------------------------------------------------------
// Modular exponentiation: base^exp mod mod  (square-and-multiply)
// ---------------------------------------------------------------------------
export function modPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helper: convert a hex string to Uint8Array
// ---------------------------------------------------------------------------
export function hexToBytes(hex) {
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Helper: convert Uint8Array to lowercase hex string
// ---------------------------------------------------------------------------
export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Helper: convert BigInt to big-endian byte array, left-padded to 256 bytes
// ---------------------------------------------------------------------------
export function bigIntToBytes(n) {
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  // Left-pad to 256 bytes (512 hex chars)
  while (hex.length < 512) hex = "00" + hex;
  return hexToBytes(hex);
}

// ---------------------------------------------------------------------------
// Generate a DH key pair.
// Returns { privateHex, publicHex }
// ---------------------------------------------------------------------------
export function generateKeyPair() {
  // 256 random bits = 32 bytes from a CSPRNG
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);

  let privateKey = BigInt("0x" + bytesToHex(rawBytes));

  // Ensure private key >= 2
  if (privateKey < 2n) privateKey = 2n;

  const publicKey = modPow(g, privateKey, p);

  return {
    privateHex: privateKey.toString(16).padStart(2, "0"),
    publicHex: publicKey.toString(16).padStart(2, "0")
  };
}

// ---------------------------------------------------------------------------
// Compute shared secret = partnerPublic^private mod p.
// Validates 2 <= partnerPublic <= p-2 before computing.
// Returns the shared secret as a BigInt.
// ---------------------------------------------------------------------------
export function computeSharedSecret(privateHex, partnerPublicHex) {
  const priv = BigInt("0x" + privateHex);
  const partnerPub = BigInt("0x" + partnerPublicHex);

  if (partnerPub < 2n || partnerPub > p - 2n) {
    throw new Error(
      "Invalid partner public key: must satisfy 2 <= key <= p-2"
    );
  }

  return modPow(partnerPub, priv, p);
}
