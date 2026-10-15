import { useTranslation } from "react-i18next";
import type { FieldError } from "../validation";

/** Translates a FieldError for display under an input. */
export function useFieldText() {
  const { t } = useTranslation();
  return (error: FieldError | undefined) => (error ? t(error.key, error.values) : null);
}
