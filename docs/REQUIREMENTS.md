# Requirements from the club

What Real Sport Clube Massamá has told us, in their words where useful. Business questions
go to the club in Portuguese through the questionnaire page
(<https://claude.ai/artifact/At3WwGbn935k5i6xXS4HsF>); technical decisions are Pedro's.
Update this file whenever new answers arrive, and adjust `ROADMAP.md` if priorities change.
Never copy personal data (names, contacts, health info) into this file or the repo.

## Answers received 2026-10-15

| Topic | Answer | Consequence |
| --- | --- | --- |
| Sports and age groups | All the listed age groups and sections (petizes to seniores, feminino, veteranos). Athlete count not given yet. | Teams/escalões are data, not hard-coded. |
| Priorities | 1) Register people and users ("registo de entidades", Pedro's wording, for access). 2) **Room and field management** is the first feature. Then incident log (ocorrências), equipment, player evaluations/scouting (today in Google Forms), call-ups. Other modules are "also interesting". | Roadmap reordered: facilities right after members; scouting and incidents added. |
| Users and roles | The proposed roles plus: nutritionist, doctor, physiotherapist, nurse, psychologist, sociologist, economato (stores), scouting, recruitment. Athlete performance evaluation is wanted. | Health staff means special-category data (GDPR art. 9), often of minors: privacy tiers are designed in M2, not bolted on later. |
| Current tools | Excel, Google Sheets, WhatsApp groups, paper, and an app called "EM JOGO". Data can be exported for import. | Import scripts in M5; EM JOGO's role to be clarified. |
| Payments | Yes to generated Multibanco / MB WAY references. Kit/equipment purchases are also charged. | Fees ledger covers equipment sales, not only quotas. |
| Language | Both Portuguese and English. | i18n pt-PT + en from the app shell (M3). |
| Budget | Pedro covers hosting for now. | Hetzner VPS, Pedro owns the accounts. |
| Other | Links to three Google Sheets (more coming), read via the Google Drive/Sheets connector. | See "Current spreadsheets" below. |

## Current spreadsheets (structure only, read 2026-10-15)

The club runs the 2026/27 season from Google Sheets. Structure matters for the data model and
for import scripts; personal data in them stays in the sheets.

**Room booking** (`MARCAÇÃO_AUDITORIO_SALAS_REUNIÕES_26-27`, tab `MARCAÇÃO_26-27`, ~400 rows).
Columns: infrastructure, department that books, date, activity, start, end, duration, status,
target group, expected participants, actual participants, notes. Lookup tab `DADOS` lists:
- Spaces: auditório, sala de reuniões 1 and 2, sala de treino de força, gabinete de
  recrutamento/metodologia, gabinete da direção, gabinete DEF.
- Departments ("gabinetes") that book: direção RSC, direção EF, coordenação, metodologia de
  treino e jogo, treino específico de GR, nutrição, avaliação funcional / treino de força,
  scouting e recrutamento, análise de dados de performance, psicologia, intervenção social,
  medicina e reabilitação, fisioterapia, gestão administrativa, plus external users: aluguer
  (rental), GP Sport Academy, Real SC SAD.
- Activities: formação, análise de jogo, reunião EE/jogadores, reunião, recrutamento.
- Statuses: confirmado, a confirmar, não confirmado, anulado, realizado, agendar, reagendar,
  adiada, reagendado, cancelado.
- Target groups: SFFRSC geral, EF geral, sub-10 to sub-19, seniores masc/fem, pais/EE,
  coordenação, direção.

**Matches** (`Marcação_Jogos_2026-27_SFFRSC`, ~400 rows plus a weekly summary tab).
Columns: section (fem/masc), escalão, birth year, date, activity (jogo treino, campeonato
FPF, taça), status, type, round, start/end/duration, coaches, number of teams, format
(fut 11 / fut 7 / fut 4+GR / fut 3), number of games, call-up, delegation, opponent, venue
(home complex campo 1/2/3 or away ground), notes, transport, kit, medical cover (e.g. first
aid with defibrillator).

**Football school** (`26-27_Escala_Turmas_Atletas_Técnicos_...`). Tabs: all activities with
participation (called up vs present), classes and coaches with schedules and **monthly fees
per class** (e.g. 37,50 € / 42,50 € / 55 €), escalões → classes (turma codes such as 11, 21,
61/81), and a long list of away venues.

**What this means for the design**
- Several organisations share people and spaces: Real SC (club), Real SC SAD (senior
  professional side), Escola de Futebol, SFFRSC, GP Sport Academy, external renters. They
  appear as booking parties and as employers of coaches.
- Escalão (age group by birth years) → turma/class (training group with code, schedule,
  fee, coach) → athletes. Teams for competition are formed from classes.
- Bookings carry a requesting department, activity type, target group, a rich status
  workflow and expected vs actual attendance. Fields at the home complex are campos 1, 2, 3
  (2 and 3 can be booked together). Questionnaire (2026-10-15): one natural-grass football
  11, one synthetic football 11 marked for football 9 and two football 7 pitches, one
  synthetic football 7/9, an athletics track, 10 rooms/gabinetes and 8 changing rooms; the
  fields belong to the club only. The Diretor da Entidade Formadora and the Diretor de Campo
  book and approve; today's pain points are overlaps, last-minute changes and telling staff,
  athletes and parents in time. Pedro wants to pick spaces on a floor plan that shows what is
  taken, and a calendar view; real floor plans requested (question `plantas`), the app uses
  a schematic plan until then.
- Matches need format, round, opponent, venue (home field or external ground), transport,
  kit and medical cover.

## Current Google Forms (structure only, read 2026-10-16)

The sporting sector (SFFRSC, "setor de formação de futebol") runs nine Google Forms owned by the
coordination account. The questions were exported with an Apps Script (Forms are not readable
through the Drive connector). Answers and the names listed inside dropdowns (trainee coaches,
monitors) are personal data and stay out of the repo. Gaps are against the app on `main`.

| Form | What it collects | Gap in the app |
| --- | --- | --- |
| **Incident / occurrence report** | Season, framework (escola de futebol or competition teams), reporter role (coach, player, guardian, director, sócio, collaborator), name, type (ocorrência, incidente, sugestão), context (treino, balneário, deslocação, jogo), date, time, description, optional follow-up contact (phone, email) and whether a reply or meeting is wanted. | M7 has types injury, discipline, damage and a team; missing: **suggestion** type, **context** (treino, balneário, deslocação, jogo), **reporter role** and optional contact for external reporters (guardians, players), **reply requested**. Reporting is anonymous-capable today, so decide whether guardians and sócios get a restricted "report" role. |
| **Staff collaboration intent (two variants: general, trainee coaches and monitors)** | Name, season, roles held (UEFA coaching grade I to IV, goalkeeper coach, trainee, team manager/secretário técnico, scouting, medical recovery, nutrition, psychology, strength and conditioning, data analysis, school and social support, logistics, communication), wants to continue next season (yes/no), ranked team preferences (escalão and escola de futebol class), reason for staying or leaving. | The people registry has no **staff profile**: coaching grade (UEFA I/C to IV/PRO, TPTD), role per season, **intent to continue** and ranked **team preferences**. Needs a season-staffing flow (M5 extension or new module). |
| **Trainee coach and monitor evaluation** | Tutor coach and grade, evaluation type (initial, intermediate, final), start season, trainee's context (teams, escola classes T11 to T61-81, management, scouting, analysis, recovery), training background (degree, vocational course, FPF course, accredited company), training institution (ISCE, FMH, UE, ULN, ...), criteria grids by institution (0 to 20 scale with level descriptors), attendance % and final notes. | M9 evaluates athletes with templates. Needs the same engine for **staff trainees**: per-institution criteria sets, 0 to 20 scale with descriptors, **tutor**, evaluation type, institution, attendance %. |
| **Observation training request (recruitment)** | Player name, birth date, minor or adult, guardian name, phone, email and relationship (parent, step-parent, family, tutor, agent), or own contact, social media link, target escalão (sub-7 to sub-19), context (federated club or school), last club/school, preferred positions (13 options), height, seasons played, why RSC, main goal, ID type, nationality, birthplace, postal code and area, preferred and alternative date, where the trial happens (and whether prior authorisation from the current club is needed), notes. | M9 prospects hold name, birth **year**, club, position, notes only. Missing: **birth date**, guardian contact and relationship, **public request form** (no login), preferred dates, trial date, **authorisation from current club**, residence, motives and goal. Needs public intake with consent text (minors, special care under GDPR). |
| **Staff equipment 26/27** | Season, staff group, name, locker (has one, number, key), locker use, kit allocated and needed (type by quantity grid), sizes, shoe size, remarks. | M8 tracks stock and loans but not **lockers** (cacifos), **per-person size sheet** and **needs vs allocated** per season. Add locker assignments and per-person sizes; reuse loans for allocations. |
| **Player manual (MORAJ) acknowledgement** | Season, framework and escalão (sub-7 to sub-19), player name and birth date, submitter (guardian or adult player), confirmation of responsibility, "took note of the manual". | App has no **document acknowledgement** flow. Needs versioned documents (manual, regulation, staff guidance) a guardian or staff member accepts per season, stored as a consent record (M17). |
| **Football school regulation acknowledgement** | Same, for escola de futebol classes (T11 to T61-81, with birth years). | As above. Escola classes need **birth-year ranges per class** and many more classes than the escalões. |
| **Staff guidance document acknowledgement** | Season, framework, name, acceptance of terms. | As above, for staff. |

### Implications for the data model

- **Staff profile** (season-scoped): coaching grade, roles, tutor, intent to continue, team preferences. People registry gap (M5).
- **Escola de futebol classes** (T11 to T61-81) as a team kind with birth-year ranges, next to the competition escalões.
- **Season** is asked on almost every form (2018-19 onwards); keep the season module as the key for all of this.
- **Acknowledgements** of versioned documents, per person and season (consent records, M17).
- **Public intake forms** (incident reports from guardians, trial requests) without a login, rate limited, with a GDPR notice.
- **Staff evaluation** reusing M9 templates with a 0 to 20 scale and level descriptors.
- **Lockers and sizes** for equipment (M8).
- Uppercase answers are a form habit ("PREENCHA EM MAIÚSCULAS"), not a data rule: store normal case.

## Import of existing data

Import expects a CSV per sheet (Google Sheets: File > Download > CSV). Column aliases are in
`apps/server/src/modules/people/import.ts`. The athlete and member sheets have not been
inspected yet, so the aliases are a best guess; send the header row of each sheet (no data)
and the mapping is adjusted.

## Open follow-ups (asked 2026-10-15)

- How room and field booking works today (spaces, subdivisions, who books/approves, shared use). M6 default: the office (secretaria, direção) confirms; coaches and delegados request for their team; the other roles only view (ADR 0005). Asked 2026-10-15 in the questionnaire (`reservas`).
- What incidents (ocorrências) cover and who may see them.
- Evaluation and scouting criteria, scales, evaluators; external prospects? M9 default: configurable templates, evaluators are coaches and the office, athletes do not see them; prospects kept 12 months (ADR 0007).
- What "EM JOGO" is and whether we replace it.
- Current fee amounts and discounts.
- Which health data each clinical role records and who else may see it (e.g. coach sees "injured" but not the diagnosis). M13 default: notes and injuries per discipline, coaches see only available / limited / unavailable, guardian consent required under 18 (ADR 0008). Not yet asked in the questionnaire.
- Which documents each person must have (exame médico, inscrição na federação, cartão de cidadão), who uploads them and how many days before expiry to warn. M14 default: kinds medical exam, federation registration, ID and other; warning 30 days before; secretaria uploads (medical exam: doctor or nurse); coaches see only the expiry of their team (ADR 0009). Asked in the questionnaire (`documentos`).
- Whether coaches and delegados may see contacts and birth dates of their own athletes and
  guardians (asked 2026-10-15; M2 default is yes, for their team or class only; see ADR 0003).
- Privacy (M17, asked 2026-10-16 in the questionnaire, `privacidade-consentimentos` and `privacidade-prazos`): which consents the
  club collects on paper today (image rights, transport, others), retention of records of
  former members and of health records, whether guardians receive health records in a data
  copy, and the contact for data requests in the privacy notice. M17 defaults: image rights
  and transport consents, guardian consent under 18, health records excluded from exports,
  audit log 3 years, notifications 12 months, contact "secretaria" (ADR 0012).
