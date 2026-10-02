import { z } from "zod";

import { emailSchema } from "./auth";

export const staffRoleSchema = z.enum(["owner", "reception", "professional"]);

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: emailSchema,
  role: staffRoleSchema,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
