function ok(res, data, message = "OK", statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

function created(res, data, message = "Created") {
  return ok(res, data, message, 201);
}

function paginated(res, items, meta, message = "OK") {
  return res.status(200).json({ success: true, data: items, meta, message });
}

module.exports = { ok, created, paginated };
