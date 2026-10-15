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
| Priorities | 1) Register people/entities (for access). 2) **Room and field management** is the first feature. Then incident log (ocorrências), equipment, player evaluations/scouting (today in Google Forms), call-ups. Other modules are "also interesting". | Roadmap reordered: facilities right after members; scouting and incidents added. |
| Users and roles | The proposed roles plus: nutritionist, doctor, physiotherapist, nurse, psychologist, sociologist, economato (stores), scouting, recruitment. Athlete performance evaluation is wanted. | Health staff means special-category data (GDPR art. 9), often of minors: privacy tiers are designed in M2, not bolted on later. |
| Current tools | Excel, Google Sheets, WhatsApp groups, paper, and an app called "EM JOGO". Data can be exported for import. | Import scripts in M5; EM JOGO's role to be clarified. |
| Payments | Yes to generated Multibanco / MB WAY references. Kit/equipment purchases are also charged. | Fees ledger covers equipment sales, not only quotas. |
| Language | Both Portuguese and English. | i18n pt-PT + en from the web shell (M3). |
| Budget | Pedro covers hosting for now. | Hetzner VPS, Pedro owns the accounts. |
| Other | Links to three Google Sheets (more coming). | Not readable from cloud sessions (Google is blocked); needs the Google Drive/Sheets connector or CSV exports. |

## Open follow-ups (asked 2026-10-15)

- How room and field booking works today (spaces, subdivisions, who books/approves, shared use).
- What incidents (ocorrências) cover and who may see them.
- Evaluation and scouting criteria, scales, evaluators; external prospects?
- What "EM JOGO" is and whether we replace it.
- Current fee amounts and discounts.
- Which health data each clinical role records and who else may see it (e.g. coach sees "injured" but not the diagnosis).
