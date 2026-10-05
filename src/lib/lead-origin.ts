import { z } from "zod";

/** Parâmetros de origem (UTMs e indicação) guardados quando o visitante chega à página da clínica. */
export const leadOriginParamsSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  ref: z.string().optional(),
});

export type LeadOriginParams = z.infer<typeof leadOriginParamsSchema>;
