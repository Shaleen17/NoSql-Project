/**
 * Key store: manages DH key pairs in localStorage and derives shared master keys.
 *
 * Private keys are stored ONLY in the browser's localStorage, never sent to
 * the server. Only the DH public key is uploaded.
 *
 * Storage key format: "chatflow:dh:<userId>"  (hex-encoded private key)
 */

import api from "../services/api.js";
import { computeSharedSecret, generateKeyPair, modPow, g, p } from "./dh.js";
import { deriveKey } from "./ciphers.js";

// In-memory cache: partnerPublicHex → Uint8Array (master key)
const masterKeyCache = new Map();

// ---------------------------------------------------------------------------
// Derive public key from private key hex
// ---------------------------------------------------------------------------
function derivePublicKeyHex(privateHex) {
  const priv = BigInt("0x" + privateHex);
  const pub = modPow(g, priv, p);
  return pub.toString(16);
}

// ---------------------------------------------------------------------------
// ensureKeyPair(userId, serverPublicKey)
//
// Ensures a DH key pair exists locally and is uploaded to the server.
// - If a local private key exists: derive its public key and compare with
//   serverPublicKey. If different (new device or cleared storage), re-upload.
// - If no local private key exists: generate a new one and upload.
//
// Returns { keyChanged: boolean }  — used to show a warning banner.
// ---------------------------------------------------------------------------
export async function ensureKeyPair(userId, serverPublicKey) {
  const storageKey = `chatflow:dh:${userId}`;
  let privateHex = localStorage.getItem(storageKey);
  let keyChanged = false;

  if (privateHex) {
    // Derive public key from stored private key
    const localPublicHex = derivePublicKeyHex(privateHex);

    if (!serverPublicKey || localPublicHex !== serverPublicKey) {
      // Key mismatch: local key differs from server (new device or cleared storage)
      keyChanged = !!serverPublicKey; // Only "changed" if server had one before
      await uploadPublicKey(localPublicHex);
    }
    // else: keys match, nothing to do
  } else {
    // No local key: generate a fresh pair
    const { privateHex: newPrivate, publicHex: newPublic } = generateKeyPair();
    localStorage.setItem(storageKey, newPrivate);
    privateHex = newPrivate;
    keyChanged = !!serverPublicKey; // Had a key on server from another device

    await uploadPublicKey(newPublic);
  }

  return { keyChanged };
}

// ---------------------------------------------------------------------------
// Upload public key to the server
// ---------------------------------------------------------------------------
async function uploadPublicKey(publicHex) {
  await api.put("/users/public-key", { publicKey: publicHex });
}

// ---------------------------------------------------------------------------
// getSharedMasterKey(currentUserId, partnerPublicKeyHex)
//
// Computes (or returns cached) shared master key between the current user
// and a partner identified by their public key.
// ---------------------------------------------------------------------------
export async function getSharedMasterKey(currentUserId, partnerPublicKeyHex) {
  if (!partnerPublicKeyHex) {
    throw new Error("Partner has no public key");
  }

  const cacheKey = `${currentUserId}:${partnerPublicKeyHex}`;

  if (masterKeyCache.has(cacheKey)) {
    return masterKeyCache.get(cacheKey);
  }

  const storageKey = `chatflow:dh:${currentUserId}`;
  const privateHex = localStorage.getItem(storageKey);

  if (!privateHex) {
    throw new Error("No local private key found. Please reload the app.");
  }

  const sharedSecret = computeSharedSecret(privateHex, partnerPublicKeyHex);
  const masterKey = await deriveKey(sharedSecret);

  masterKeyCache.set(cacheKey, masterKey);
  return masterKey;
}

// ---------------------------------------------------------------------------
// clearMasterKeyCache — call when switching users or logging out
// ---------------------------------------------------------------------------
export function clearMasterKeyCache() {
  masterKeyCache.clear();
}
