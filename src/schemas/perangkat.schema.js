import { z } from "zod";

export const createPerangkatSchema = z.object({
  ID_PerangkatIot: z.string().min(1),
  Nama_LokasiPerangkat: z.string().min(1)
});

export const updatePerangkatSchema = z.object({
  ID_PerangkatIot: z.string().min(1).optional(),
  Nama_LokasiPerangkat: z.string().min(1).optional()
});

export const deletePerangkatSchema = z.object({
  ID_PerangkatIot: z.string().min(1)
});