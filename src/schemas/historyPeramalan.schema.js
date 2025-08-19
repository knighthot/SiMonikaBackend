import { z } from "zod";

export const createHistoryPeramalanSchema = z.object({
  ID_Tambak: z.string().uuid(),
  Tanggal_Awal: z.coerce.date(),
  Tanggal_Akhir: z.coerce.date(),
  Jumlah_Hari: z.number().int().positive(),
  Data_WQI: z.any().optional(),
  Data_Parameter: z.any().optional(),
  Ada_Anomali: z.boolean().optional(),
  Detail_Anomali: z.string().optional(),
  Waktu_Hit_API: z.coerce.date().optional()
});

export const updateHistoryPeramalanSchema = createHistoryPeramalanSchema.partial();
