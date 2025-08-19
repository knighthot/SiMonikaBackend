import { z } from "zod";

export const createUserSchema = z.object({
  Nama_tambak: z.string().min(1),
  Password: z.string().min(6),
  Role: z.enum(["ADMIN", "USER"]).default("USER"),
  ID_Tambak: z.string().uuid().nullable().optional()
});

export const updateUserSchema = z.object({
  Nama_tambak: z.string().min(1).optional(),
  Password: z.string().min(6).optional(),
  Role: z.enum(["ADMIN", "USER"]).optional(),
  ID_Tambak: z.string().uuid().nullable().optional()
});
