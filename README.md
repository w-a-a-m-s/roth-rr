# Roth conversion planner

A Next.js app for planning Roth conversions. Describe a household, and it
projects finances year by year, then compares doing nothing with running
conversions.

Auth.js is part of this app, at `/api/auth`. Plans live in MongoDB.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env` and fill in the values. The app reads that one
file.

To open a signed-in session in the Cursor browser, see
[docs/dev-login.md](docs/dev-login.md).

## Tests

```bash
npm test
```

## More

- Engine and architecture: [AGENTS.md](AGENTS.md)
- Impersonation: [docs/impersonation.md](docs/impersonation.md)
- Tax and Medicare tables: [docs/external-data.md](docs/external-data.md)
