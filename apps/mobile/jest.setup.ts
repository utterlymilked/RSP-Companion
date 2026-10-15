import { DEFAULT_LOCALE } from "@rsc/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./src/i18n";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Tests render Portuguese copy, as users see it by default.
i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  initAsync: false,
});
