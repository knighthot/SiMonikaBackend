import { z } from "zod";

export const createTambakSchema = z.object({
  Nama: z.string().min(1),
  ID_Perangkat: z.string().uuid().nullable().optional(),
  Substrat: z.string().optional(),
  Latitude: z.number().optional(),
  Longitude: z.number().optional(),
  Keterangan: z.string().optional()
});

export const updateTambakSelfSchema = z.object({
  body: z.object({
    Nama: z.string().min(1).max(100).optional(),
    Substrat: z.enum(["Tanah", "Terpal", "Beton", "Campuran", "Lainnya"]).optional(),
    Latitude: z.number().gte(-90).lte(90).nullable().optional(),
    Longitude: z.number().gte(-180).lte(180).nullable().optional(),
  })
});

export const updateTambakSchema = createTambakSchema.partial();
