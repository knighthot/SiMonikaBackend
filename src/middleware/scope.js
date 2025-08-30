// scope.js

/** Paksa LIST hanya melihat data tambak milik user (ROLE: USER) */
export function forceQueryOwnTambak(req, res, next) {
  if (req.user?.role !== "USER") return next();

  const tambakId = req.user?.tambakId;
  if (!tambakId) {
    return res.status(403).json({
      message: "Forbidden: akun belum terhubung ke tambak.",
      code: "NO_TAMBAK_BOUND",
    });
  }

  // ⚠️ Express 5: req.query adalah getter-only — JANGAN reassign.
  // Mutasi property-nya saja:
  if (req.query && typeof req.query === "object") {
    req.query.ID_Tambak = tambakId;
  }

  // Fallback untuk controller (kalau ada environment yang tetap read-only)
  res.locals.ID_Tambak = tambakId;

  next();
}

/** Paksa CREATE/UPDATE hanya untuk tambak milik user (ROLE: USER) */
export function forceBodyOwnTambak(req, res, next) {
  if (req.user?.role !== "USER") return next();

  const tambakId = req.user?.tambakId;
  if (!tambakId) {
    return res.status(403).json({
      message: "Forbidden: akun belum terhubung ke tambak.",
      code: "NO_TAMBAK_BOUND",
    });
  }

  // Pastikan body ada lalu validasi konsistensi
  if (!req.body || typeof req.body !== "object") req.body = {};

  if (
    typeof req.body.ID_Tambak !== "undefined" &&
    req.body.ID_Tambak !== tambakId
  ) {
    return res.status(403).json({
      message: "Forbidden: ID_Tambak tidak sesuai dengan kepemilikan akun.",
      code: "TAMBAK_MISMATCH",
    });
  }

  // Set tanpa reassign object body
  req.body.ID_Tambak = tambakId;

  // Fallback
  res.locals.ID_Tambak = tambakId;

  next();
}

/** GET /tambak/:id → USER hanya boleh akses tambaknya sendiri */
export function onlyOwnTambakParam(req, res, next) {
  if (req.user?.role === "ADMIN") return next();

  const tambakId = req.user?.tambakId;
  if (!tambakId) {
    return res.status(403).json({
      message: "Forbidden: akun belum terhubung ke tambak.",
      code: "NO_TAMBAK_BOUND",
    });
  }

  if (String(req.params?.id) !== String(tambakId)) {
    return res.status(403).json({ message: "Forbidden", code: "NOT_OWN_RESOURCE" });
  }

  next();
}
