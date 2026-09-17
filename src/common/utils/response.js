// The success half of the API contract. Every JSON body is
// { success: true, data, message } — plus `pagination` for list endpoints —
// so a client can branch on `success` without special-casing per endpoint.
// Deliberately not used for the Stripe webhook (Stripe defines that response)
// or for 204s, which carry no body.
function ok(res, data, message = "OK", statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

function created(res, data, message = "Created") {
  return ok(res, data, message, 201);
}

function noContent(res) {
  return res.status(204).end();
}

function paginated(res, items, pagination, message = "OK") {
  return res.status(200).json({ success: true, data: items, pagination, message });
}

module.exports = { ok, created, noContent, paginated };
