import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rsc/shared";
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ptPT from "./pt-PT.json";

export const resources = { "pt-PT": { translation: ptPT }, en: { translation: en } } as const;

const STORAGE_KEY = "rsc.locale";

/** The device's language if we support it (any Portuguese → pt-PT), else the default. */
export function deviceLocale(languageCodes: readonly (string | null)[]): Locale {
  for (const code of languageCodes) {
    if (code === "pt") return "pt-PT";
    if (code === "en") return "en";
  }
  return DEFAULT_LOCALE;
}

const isLocale = (value: string | null): value is Locale =>
  (LOCALES as readonly string[]).includes(value ?? "");

/** Starts i18next with the saved choice, or the device language on first run. */
export async function initI18n(): Promise<void> {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing): fall back to the device language.
  }
  const lng = isLocale(saved) ? saved : deviceLocale(getLocales().map((l) => l.languageCode));
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
