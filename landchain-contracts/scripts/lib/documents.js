// Empreintes SHA-256 des documents de démonstration.
// Même résultat que le navigateur (Web Crypto API) : SHA-256 des octets du fichier,
// écrit en hexadécimal sur 32 octets (type bytes32).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DOCS_DIR = path.join(__dirname, "..", "..", "demo-documents");

function sha256Hex(buffer) {
  return "0x" + crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashDemoDocument(fileName) {
  return sha256Hex(fs.readFileSync(path.join(DOCS_DIR, fileName)));
}

module.exports = { DOCS_DIR, sha256Hex, hashDemoDocument };
