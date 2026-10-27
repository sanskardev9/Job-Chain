# Job-Chain

Job-Chain helps you find jobs, track your applications, and apply faster.

- **Jobs:** browse remote openings (Remotive) and bookmark the ones you like.
- **Applied:** track every application and move it through applied, interview, offer or rejected.
- **JobPilot:** finds matching jobs across Europe (EURES, Arbeitnow), scores them against your
  profile with transparent rules (no AI), and drafts tailored application emails with your CV.
  You review every draft, and only approved ones are sent, from your own Gmail.

## Tech stack

- Next.js 15 (JavaScript) and Tailwind CSS, deployed on Vercel
- Supabase: email/password auth, Postgres with row-level security, private storage for CVs
- Google OAuth with the send-only Gmail scope, so each user sends from their own Gmail
- JobPilot worker (Python) in the separate `jobchain-backend` repo, deployed on Render

## Run locally

```sh
npm install
npm run dev
```

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_JOBPILOT_WORKER_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GMAIL_TOKEN_KEY=
```

`GMAIL_TOKEN_KEY` must match the JobPilot worker's value. The database schema is in
`supabase/schema.sql`; the JobPilot design is in `docs/JOBPILOT_INTEGRATION.md`.
