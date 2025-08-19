import { z } from "zod";

export const createHistorySchema = z.object({
  ID_Tambak: z.string().uuid(),
  Waktu_History: z.coerce.date().optional(),
  pH: z.number().optional(),
  suhu: z.number().optional(),
  kekeruhan: z.number().optional(),
  salinitas: z.number().optional()
});

export const updateHistorySchema = createHistorySchema.partial();
