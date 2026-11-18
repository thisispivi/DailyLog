import { z } from "zod";

export const loginSchema = z.strictObject({ password: z.string().min(1).max(256) });

export const changePasswordSchema = z.strictObject({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(256),
});
