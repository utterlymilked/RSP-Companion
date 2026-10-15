import { PASSWORD_MIN_LENGTH, passwordSchema } from "@rsp/shared";
import { z } from "zod";

/** i18n error for a field, or null when valid. Same rules as the API's zod schemas. */
export type FieldError = { key: string; values?: Record<string, unknown> } | null;

export function emailError(email: string): FieldError {
  if (!email.trim()) return { key: "validation.required" };
  return z.email().safeParse(email.trim()).success ? null : { key: "validation.email" };
}

export function requiredError(value: string): FieldError {
  return value.trim() ? null : { key: "validation.required" };
}

export function newPasswordError(password: string): FieldError {
  return passwordSchema.safeParse(password).success
    ? null
    : { key: "validation.passwordLength", values: { min: PASSWORD_MIN_LENGTH } };
}

export function confirmError(password: string, confirm: string): FieldError {
  return password === confirm ? null : { key: "validation.passwordsDiffer" };
}
