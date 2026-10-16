# UI guidelines

Rules every screen in `apps/mobile` follows. They come from Material Design 3, Apple's Human
Interface Guidelines and Nielsen Norman Group research (sources at the end), adapted to one
codebase that runs on phones and on desktop browsers. When a rule here and a habit disagree, the
rule wins; when a case isn't covered, pick what those sources recommend and add it here.

## Choosing a selection control

Pick by how many options there are and whether one or several can be chosen. Never lay out
more than five options as a wall of chips or buttons, and never stack full-width buttons to
make a choice.

| Options | One value | Several values |
| --- | --- | --- |
| 2-5, short labels | `Segmented` (via `Choice`), all visible | `MultiSelect` (or checkboxes in a list) |
| 6 or more, or long labels | `Select` | `MultiSelect` |
| 8 or more | `Select`, searchable (automatic) | `MultiSelect`, searchable (automatic) |
| Hundreds, loaded from the API (people) | `Select` with `onSearch` | `MultiSelect` with `onSearch` |
| Turning one thing on or off | `Switch` | |

- **Use `Choice` for any single choice.** It measures the options and renders a segmented
  control when 2-5 labels fit side by side on a 360 pt phone without cutting words, otherwise
  a `Select`. Option lists from the database (teams, spaces, templates) grow, so they must go
  through `Choice` or `Select`, never a hand-made row.
- **`Segmented` is for 2-5 options** (Material 3 segmented buttons, Apple HIG: "no more than
  about five segments on iPhone"). With `kind="tab"` it switches views of the same content
  (plan, day, week); in forms and filters `Choice` uses it with `kind="radio"`.
- **`Select` is the combo box.** A field that shows the current value and opens the options:
  a dropdown under the field on screens 600 pt and wider, a bottom sheet on phones. Lists of
  `SEARCH_FROM` (8) or more get a search box that ignores case and accents ("medico" finds
  "Médico"); Enter picks the first match on the web.
- **`MultiSelect` has a checkbox per option**, a "n selecionadas" count, "Limpar" and
  "Concluído". The field shows the chosen labels.
- **Unavailable options stay visible, greyed out, with a hint saying why** (`disabled` and
  `hint` on the option) instead of disappearing, so the list doesn't change shape (NN/g). Put
  them after the available ones.
- **Keep the label visible.** Every field has its label above it, like `TextField`; the
  dropdown opens under the field so the label stays in view, and the sheet repeats it as its
  title.
- **Don't use a select where typing is faster.** Dates, times, amounts and free text are text
  fields (or a date picker), not lists.
- **Chips are not a selection control here.** If chips appear at all, they show what was
  chosen or filtered (with a remove action), never the full set of options.

## Layout and touch

- Touch targets are at least 48 pt (`touchTarget` in `src/theme.ts`; HIG asks for 44, Material
  for 48). Rows in a select, segments and buttons all meet it.
- Forms are one column, at most 560 pt wide on desktop, with 16 pt gutters on phones and no
  horizontal scrolling.
- One primary button per screen or form (the action that completes it). Secondary actions use
  `variant="secondary"` or `ghost`. Several actions of equal weight go in one row of compact
  buttons, three at most; more than that become a menu.
- Colours, spacing, radius and font sizes come only from `src/theme.ts`. Everything works in
  light and dark mode.

## Verifying a screen

Check every screen you add or change in the browser at a phone width (390 x 844) and a desktop
width (1440 x 900), with the demo data (`pnpm db:seed`, login `admin@rsc.test`). Open each
select once in both widths. Screen tests open a select with `choose(label, option)` from
`apps/mobile/test/render.tsx`.

## Sources

- Material Design 3, segmented buttons: <https://m3.material.io/components/segmented-buttons/guidelines>
  and the Compose guide ("for more than five items, use chips" or a menu):
  <https://developer.android.com/develop/ui/compose/components/segmented-button>
- Material Design 3, menus (exposed dropdown menus for selection): <https://m3.material.io/components/menus/guidelines>
- Apple HIG, segmented controls: <https://developer.apple.com/design/human-interface-guidelines/segmented-controls>
- Apple HIG, pickers and pop-up buttons: <https://developer.apple.com/design/human-interface-guidelines/pickers>
- NN/g, drop-down menus (long lists, typing beats scrolling, grey out unavailable options,
  keep the label visible): <https://www.nngroup.com/articles/drop-down-menus/>
- NN/g, checkboxes vs. radio buttons: <https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/>
- WAI-ARIA Authoring Practices, combobox pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>
