export function forceQueryOwnTambak(req, res, next) {
  // untuk LIST: paksa query.ID_Tambak = tambak user (kalau USER)
  if (req.user?.role === "USER") {
    req.query = { ...req.query, ID_Tambak: req.user.tambakId };
  }
  next();
}

export function forceBodyOwnTambak(req, res, next) {
  // untuk CREATE/UPDATE: set body.ID_Tambak = tambak user (kalau USER)
  if (req.user?.role === "USER") {
    if (req.body?.ID_Tambak && req.body.ID_Tambak !== req.user.tambakId) {
      return res.status(403).json({ message: "Forbidden: wrong tambak" });
    }
    req.body = { ...req.body, ID_Tambak: req.user.tambakId };
  }
  next();
}

/** Khusus endpoint GET /tambak/:id → USER hanya boleh akses tambaknya sendiri */
export function onlyOwnTambakParam(req, res, next) {
  if (req.user?.role === "ADMIN") return next();
  if (req.params?.id !== req.user?.tambakId) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}