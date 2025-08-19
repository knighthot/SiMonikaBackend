import { z } from "zod";

export const createTambakSchema = z.object({
  Nama: z.string().min(1),
  ID_Perangkat: z.string().uuid().nullable().optional(),
  Substrat: z.string().optional(),
  Latitude: z.number().optional(),
  Longitude: z.number().optional(),
  Keterangan: z.string().optional()
});

export const updateTambakSchema = createTambakSchema.partial();
