import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rsc/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ptPT from "./pt-PT.json";

export const resources = { "pt-PT": { translation: ptPT }, en: { translation: en } } as const;

const STORAGE_KEY = "rsc.locale";

const isLocale = (value: string | null): value is Locale =>
  (LOCALES as readonly string[]).includes(value ?? "");

/**
 * Starts i18next with the user's saved choice, or Portuguese (the club's language) when they
 * have not picked one. The phone's language is deliberately ignored: the club wants pt-PT.
 */
export async function initI18n(): Promise<void> {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing): use the default.
  }
  const lng = isLocale(saved) ? saved : DEFAULT_LOCALE;
  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false }, // React escapes already
    returnNull: false,
  });
}

export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not persisted; the choice still applies until the app restarts.
  }
}

export { i18n };
