// Sends a stored file. Uploaded content is never rendered in the browser: it
// is always an attachment with the exact stored Content-Type (which was
// verified against the file's magic bytes at upload), plus nosniff so a
// browser cannot decide to treat it as HTML and execute it. Nothing here
// exposes a storage key or a filesystem path.
function sendFile(res, { buffer, filename, contentType, sizeBytes }) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", sizeBytes ?? buffer.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Private user documents: never store them in a shared cache.
  res.setHeader("Cache-Control", "private, no-store");
  // Both forms: the plain one for old clients, the RFC 5987 one for anything
  // non-ASCII. The name is already sanitized (middleware/upload.displayName).
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  return res.send(buffer);
}

module.exports = { sendFile };
