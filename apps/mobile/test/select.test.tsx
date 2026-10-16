import { fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Choice, fitsInline } from "../src/ui/Choice";
import { filterOptions, MultiSelect, SEARCH_FROM } from "../src/ui/Select";
import { renderScreen } from "./render";

const opts = (...labels: string[]) => labels.map((label) => ({ value: label, label }));

it("keeps 2-5 short options inline and sends the rest to a select", () => {
  expect(fitsInline(opts("Casa", "Fora"))).toBe(true);
  expect(fitsInline(opts("Treino", "Jogo", "Evento do clube"))).toBe(true);
  expect(fitsInline(opts("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"))).toBe(true);
  expect(fitsInline(opts("Sub-13"))).toBe(false);
  expect(fitsInline(opts("Bolas", "Coletes", "Equipamentos", "Treino", "Outro"))).toBe(false);
  expect(fitsInline(opts("a", "b", "c", "d", "e", "f").map((o) => ({ ...o, label: "Ab" })))).toBe(
    true,
  );
  expect(fitsInline(opts("Um", "Dois", "Três", "Quatro", "Cinco", "Seis"))).toBe(false);
});

it("matches options without case or accents", () => {
  const options = opts("Médico", "Enfermeiro", "Psicólogo");
  expect(filterOptions(options, "medi").map((o) => o.label)).toEqual(["Médico"]);
  expect(filterOptions(options, "  PSICO ").map((o) => o.label)).toEqual(["Psicólogo"]);
  expect(filterOptions(options, "")).toHaveLength(3);
});

it("renders a short choice as radios and a long one as a field", async () => {
  await renderScreen(
    <>
      <Choice label="Local" options={opts("Casa", "Fora")} value="Casa" onChange={() => {}} />
      <Choice
        label="Equipa"
        options={opts("Sub-7", "Sub-9", "Sub-11", "Sub-13", "Sub-15", "Sub-17")}
        value={null}
        onChange={() => {}}
      />
    </>,
  );
  expect(screen.getByRole("radio", { name: "Casa" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Equipa: Escolher" })).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Sub-7" })).toBeNull();
});

function Roles({ labels }: { labels: string[] }) {
  const [values, setValues] = useState<string[]>([]);
  return (
    <MultiSelect label="Funções" options={opts(...labels)} values={values} onChange={setValues} />
  );
}

it("searches a long list and keeps several choices", async () => {
  const labels = Array.from({ length: SEARCH_FROM }, (_, i) => `Função ${i + 1}`);
  await renderScreen(<Roles labels={[...labels, "Médico"]} />);
  await fireEvent.press(screen.getByRole("button", { name: "Funções: Escolher" }));
  await fireEvent.changeText(screen.getByLabelText("Pesquisar"), "medico");
  expect(screen.queryByRole("checkbox", { name: "Função 1" })).toBeNull();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Médico" }));
  await fireEvent.changeText(screen.getByLabelText("Pesquisar"), "");
  await fireEvent.press(screen.getByRole("checkbox", { name: "Função 2" }));
  expect(screen.getByText("2 selecionadas")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Concluído" }));
  expect(screen.getByRole("button", { name: "Funções: Função 2, Médico" })).toBeTruthy();
});
