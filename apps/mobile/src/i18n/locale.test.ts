import AsyncStorage from "@react-native-async-storage/async-storage";
import { i18n, initI18n } from "./index";

it("defaults to Portuguese whatever the phone's language, and keeps a saved choice", async () => {
  await AsyncStorage.clear();
  await initI18n();
  expect(i18n.language).toBe("pt-PT");
  await AsyncStorage.setItem("rsc.locale", "en");
  await initI18n();
  expect(i18n.language).toBe("en");
  await i18n.changeLanguage("pt-PT");
});
