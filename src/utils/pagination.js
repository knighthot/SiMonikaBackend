export function buildPaging(query) {
  const page = Math.max(parseInt(query.page ?? "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit ?? "10", 10), 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function wrapPaging({ count, rows }, page, limit) {
  const totalPages = Math.max(Math.ceil(count / limit), 1);
  return {
    data: rows,
    meta: { total: count, page, limit, totalPages }
  };
}
