// Content-based file typing. A client controls both the filename and the
// Content-Type header, so neither says anything about what was actually
// uploaded: `virus.exe` renamed to `cv.pdf` and sent as application/pdf passes
// every extension/MIME check. These signatures look at the bytes instead.
//
// Deliberately tiny and allowlist-only: this project accepts five formats, and
// a signature table beats a dependency that parses hundreds.
const SIGNATURES = [
  { contentType: "application/pdf", extensions: [".pdf"], magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  // Legacy .doc — an OLE2 compound document.
  {
    contentType: "application/msword",
    extensions: [".doc"],
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
  // .docx is a ZIP container; so are several other formats, so the extension
  // and declared type decide between them once the container is confirmed.
  {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: [".docx"],
    magic: [0x50, 0x4b, 0x03, 0x04], // PK\x03\x04
  },
  { contentType: "image/jpeg", extensions: [".jpg", ".jpeg"], magic: [0xff, 0xd8, 0xff] },
  { contentType: "image/png", extensions: [".png"], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // RIFF....WEBP — bytes 8-11 identify the payload.
  {
    contentType: "image/webp",
    extensions: [".webp"],
    magic: [0x52, 0x49, 0x46, 0x46],
    at8: [0x57, 0x45, 0x42, 0x50],
  },
];

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

// Returns the detected content type, or null when the bytes match nothing we
// accept (including an empty buffer).
function detect(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const match = SIGNATURES.find((s) => startsWith(buffer, s.magic) && (!s.at8 || startsWith(buffer, s.at8, 8)));
  return match ? match.contentType : null;
}

// True when the bytes, the declared type and the extension all agree.
function matches(buffer, { contentType, extension }) {
  const detected = detect(buffer);
  if (!detected || detected !== contentType) return false;
  const signature = SIGNATURES.find((s) => s.contentType === contentType);
  return signature.extensions.includes(extension);
}

module.exports = { detect, matches, SIGNATURES };
