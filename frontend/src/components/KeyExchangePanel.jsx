import { useEffect, useState } from "react";
import { modPow, g, p } from "../crypto/dh.js";

const PRIME_HEX = p.toString(16);
const GENERATOR = g.toString();

/**
 * Truncate a long hex string for display: show first 8 + "…" + last 8 chars.
 */
function shorten(hex) {
  if (!hex || hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

/**
 * Copy a string to the clipboard.
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_e) {
    // Clipboard API not available in this context
  }
}

/**
 * KeyExchangePanel — collapsible panel showing DH parameters and shared-key fingerprint.
 *
 * Props:
 *   currentUserId   — string
 *   partner         — User object (may be null)
 *   fingerprint     — string ("xxxx xxxx xxxx xxxx") or ""
 *   masterKey       — Uint8Array or null
 *   selectedCipher  — "caesar" | "vernam"
 *   showServerView  — boolean
 *   onToggleServerView — () => void
 */
const KeyExchangePanel = ({
  currentUserId,
  partner,
  fingerprint,
  masterKey,
  selectedCipher,
  showServerView,
  onToggleServerView
}) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [myPubKeyDisplay, setMyPubKeyDisplay] = useState("");

  // Derive my public key for display from stored private key
  useEffect(() => {
    if (!currentUserId) return;
    const privHex = localStorage.getItem(`chatflow:dh:${currentUserId}`);
    if (!privHex) return;

    try {
      const priv = BigInt("0x" + privHex);
      const pub = modPow(g, priv, p);
      setMyPubKeyDisplay(pub.toString(16));
    } catch (_e) {
      // Could not derive public key
    }
  }, [currentUserId]);

  const handleCopy = async (text, label) => {
    await copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  // Caesar shift derived from masterKey[0]
  const caesarShift = masterKey ? (masterKey[0] % 94) + 1 : null;

  return (
    <div className="kex-panel-wrapper">
      <button
        type="button"
        className="kex-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        title="Toggle key exchange info"
      >
        🔐 {open ? "Hide" : "Key Info"}
      </button>

      {open ? (
        <div className="kex-panel">
          <h3 className="kex-title">Key Exchange Info (DH Group 14)</h3>

          <div className="kex-row">
            <span className="kex-label">Prime p:</span>
            <span className="kex-value mono">
              {shorten(PRIME_HEX)}
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(PRIME_HEX, "prime")}
                title="Copy full prime"
              >
                {copied === "prime" ? "✓" : "📋"}
              </button>
            </span>
          </div>

          <div className="kex-row">
            <span className="kex-label">Generator g:</span>
            <span className="kex-value mono">{GENERATOR}</span>
          </div>

          <div className="kex-row">
            <span className="kex-label">My public key:</span>
            <span className="kex-value mono">
              {myPubKeyDisplay ? shorten(myPubKeyDisplay) : "…"}
              {myPubKeyDisplay ? (
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => handleCopy(myPubKeyDisplay, "mypub")}
                  title="Copy my public key"
                >
                  {copied === "mypub" ? "✓" : "📋"}
                </button>
              ) : null}
            </span>
          </div>

          <div className="kex-row">
            <span className="kex-label">Partner public key:</span>
            <span className="kex-value mono">
              {partner?.publicKey ? shorten(partner.publicKey) : "Not available"}
            </span>
          </div>

          <div className="kex-row kex-fingerprint-row">
            <span className="kex-label">Shared key fingerprint:</span>
            <span className="kex-fingerprint mono">
              {fingerprint || (partner?.publicKey ? "Computing…" : "No partner key")}
            </span>
          </div>

          {caesarShift !== null ? (
            <div className="kex-row">
              <span className="kex-label">Caesar shift:</span>
              <span className="kex-value mono">{caesarShift}</span>
            </div>
          ) : null}

          <div className="kex-row">
            <span className="kex-label">Active cipher:</span>
            <span className="kex-value">{selectedCipher}</span>
          </div>

          <p className="kex-hint">
            💡 Compare the fingerprint with your partner. If it matches on both sides, no one has tampered with the key exchange.
          </p>

          <label className="kex-toggle-label">
            <input
              type="checkbox"
              checked={showServerView}
              onChange={onToggleServerView}
            />
            {" "}Show what the server sees
          </label>
        </div>
      ) : null}
    </div>
  );
};

export default KeyExchangePanel;
