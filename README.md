# RSP Companion

Club management companion app for **Real Sport Clube Massamá** (Portugal): members and
teams, training and match calendar, attendance and call-ups, transport, equipment, fees,
documents and notifications, with role-based access for direção, staff, coaches,
athletes, guardians and members.

Status: early development. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

Requires Node 22, pnpm (`corepack enable`) and Docker for Postgres.

```sh
pnpm install
cp .env.example .env
docker compose up -d   # Postgres 17
pnpm db:migrate        # create the tables
pnpm db:seed           # optional: fake club data
pnpm dev        # API on http://localhost:3000, app (web) on http://localhost:8081
pnpm check      # lint, typecheck, tests
```

To try the app on a phone, install **Expo Go**, put
`EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:3000` in `apps/mobile/.env.local`, run
`pnpm dev` and scan the QR code it prints.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Requirements from the club](docs/REQUIREMENTS.md)
- [Decision records](docs/adr/README.md)
- [Guide for Claude Code sessions](CLAUDE.md)
