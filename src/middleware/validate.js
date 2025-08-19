/**
 * validate(schema, { path: "body" | "query" | "params" })
 * Contoh: router.post("/", validate(schemaCreate), controller.create)
 */
export function validate(schema, where = "body") {
  return (req, res, next) => {
    try {
      const data = schema.parse(req[where]);
      // simpan hasil parse agar pasti terketik & bersih
      req[where] = data;
      next();
    } catch (e) {
      const issues = e?.issues?.map(i => ({
        path: i.path?.join("."),
        message: i.message
      })) || [{ message: "Invalid payload" }];
      return res.status(422).json({ message: "Validation error", issues });
    }
  };
}
