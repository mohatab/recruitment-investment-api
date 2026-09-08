function ok(res, data, message = "OK", statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

function created(res, data, message = "Created") {
  return ok(res, data, message, 201);
}

module.exports = { ok, created };
