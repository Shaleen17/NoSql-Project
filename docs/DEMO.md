# ChatFlow — Encryption Demo Guide

This document describes how to demonstrate that messages are stored as ciphertext in MongoDB and that network traffic contains no plaintext.

---

## 1. MongoDB Verification

Connect to MongoDB using the shell or Compass, then run:

```js
// Show the 5 most recent messages
db.messages.find().sort({ createdAt: -1 }).limit(5).pretty()
```

### What to look for

On an unencrypted (legacy) message:
```json
{
  "text": "Hello there",
  "isEncrypted": false,
  "cipher": "none",
  "nonce": null
}
```

On an encrypted message:
```json
{
  "text": "5f3a1c2d9e...",       ← hex ciphertext (Vernam) or shifted ASCII (Caesar)
  "isEncrypted": true,
  "cipher": "vernam",
  "nonce": "a3f1b2c4d5e6f7a8b9c0d1e2"  ← 24-char hex nonce
}
```

And in the chats collection:
```js
db.chats.find().sort({ updatedAt: -1 }).limit(3).pretty()
```

```json
{
  "lastMessageText": "🔒 Encrypted message"   ← never stores plaintext
}
```

**Before vs After comparison:**
| Field | Before (plaintext) | After (encrypted) |
|-------|-------------------|-------------------|
| `messages.text` | `"Hello!"` | `"3a7f9c…"` |
| `messages.isEncrypted` | `false` | `true` |
| `chats.lastMessageText` | `"Hello!"` | `"🔒 Encrypted message"` |

---

## 2. Wireshark Traffic Capture

### Setup

1. Install [Wireshark](https://www.wireshark.org/).
2. Open Wireshark and select the **Loopback** adapter (`lo` on Linux/macOS, `Npcap Loopback Adapter` on Windows).
3. Apply capture filter:
   ```
   tcp.port == 5000
   ```

### Capturing a message

1. Start the backend (`npm run dev` in `backend/`).
2. Start Wireshark capture on the loopback adapter.
3. In the browser, send a message in the chat.
4. Stop capture.

### What to look for

In Wireshark, find a packet with HTTP/WebSocket data going to port 5000.  
Right-click → **Follow → TCP Stream**.

You should see Socket.IO frames containing the `send_message` event payload like:

```
42["send_message",{"chatId":"...","text":"5f3a1c2d9e4b7a...","cipher":"vernam","nonce":"a3f1b2...","isEncrypted":true}]
```

The `text` field contains **ciphertext** (hex), not the original plaintext message.

### Before vs After

| Scenario | Network payload `text` field |
|----------|------------------------------|
| Before encryption was added | `"Hello, Bob!"` |
| After encryption (Vernam) | `"5f3a1c2d9e4b7a08c3..."` |
| After encryption (Caesar) | Shifted printable ASCII chars |

---

## 3. Browser Storage Verification

Open DevTools → Application → Local Storage:

| Key | Value |
|-----|-------|
| `chatflow:dh:<userId>` | 64-char hex (your private key — **never leaves the browser**) |
| `chat_token` | JWT token |
| `chat_user` | Your user object (includes public key, but NOT private key) |

---

## 4. Key Fingerprint Comparison

Both chat participants should open the **🔐 Key Info** panel and compare the **Shared key fingerprint** line (format: `xxxx xxxx xxxx xxxx`).

If the fingerprints match, the Diffie-Hellman key exchange was not tampered with.
