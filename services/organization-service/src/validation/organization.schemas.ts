import { z } from "zod";
import { nonEmptyString } from "@nexora/validation";

export const updateOrganizationSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
