import { useEffect, useState } from "react";
import { api } from "./api";

export function App() {
  const [status, setStatus] = useState("…");

  useEffect(() => {
    api.health
      .$get()
      .then((res) => res.json())
      .then((body) => setStatus(`${body.status} (${body.version})`))
      .catch(() => setStatus("indisponível"));
  }, []);

  return (
    <main>
      <h1>RSP Companion</h1>
      <p>Real Sport Clube Massamá</p>
      <p>API: {status}</p>
    </main>
  );
}
