import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../src/api";

export default function Home() {
  const [status, setStatus] = useState("…");

  useEffect(() => {
    api.health
      .$get()
      .then((res) => res.json())
      .then((body) => setStatus(`${body.status} (${body.version})`))
      .catch(() => setStatus("indisponível"));
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>RSP Companion</Text>
      <Text>Real Sport Clube Massamá</Text>
      <Text>API: {status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "600" },
});
