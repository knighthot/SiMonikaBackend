import { z } from "zod";

export const registerSchema = z.object({
  Nama_tambak: z.string().min(1, "Nama_tambak required").optional(),
  Password: z.string().min(6),
  Role: z.enum(["ADMIN", "USER"]).optional(),
  ID_Tambak: z.string().uuid().nullable().optional()
});

export const loginSchema = z.object({
  Nama_tambak: z.string().min(1),
  Password: z.string().min(1)
});
