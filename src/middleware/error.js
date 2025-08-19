// 404
export function notFound(_req, res, _next) {
  res.status(404).json({ message: "Route not found" });
}

// error handler
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const payload = {
    message: err.message || "Internal Server Error"
  };
  if (process.env.NODE_ENV !== "production") {
    payload.stack = err.stack;
  }
  res.status(status).json(payload);
}
