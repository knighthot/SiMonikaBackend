import { z } from "zod";

export const registerIotSchema = z.object({
  ID_PerangkatIot: z.string().min(1),
  Nama_LokasiPerangkat: z.string().min(1).optional(),
  ID_Tambak: z.string().uuid().optional()
});
