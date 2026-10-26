# JobPilot ↔ JobChain Integration (handoff)

Context carried over from a planning session in `../jobchain-backend`.
Full JobPilot spec: `/Users/sanskarsingh/ME_COde/JobPilot/JobPilot_Project_Description_and_Implementation_Plan.docx`.

## The two projects

- **JobChain** (this repo): Next.js 15 (JS) + Tailwind + Supabase email/password auth.
  Lists Remotive remote jobs (`/jobs`), bookmarks (`/bookmarks`), manual apply tracking
  with statuses applied/interview/offer/rejected (`/applied`). All state in Supabase `jobs`.
  README is outdated (mentions MetaMask/TypeScript/MongoDB) — fix later.
- **JobPilot** (separate repo, not built yet): free, local, rule-based (no AI) Python pipeline
  that discovers frontend jobs in Europe (EURES, employer career pages), extracts requirements,
  scores fit against the user's profile (Strong / Possible / Unlikely + reasons, blockers,
  unknowns), drafts vacancy-specific application emails, and sends them via the user's own
  Gmail (Gmail API, OAuth desktop client, scope `gmail.send`).

Hard rules from the spec: never guess emails, never claim unconfirmed skills/languages,
never assume visa sponsorship, dry-run first, approval before every send, per-run send cap,
no CAPTCHA bypass, no secrets in git or logs.

## Decisions

- JobPilot is a multi-user backend worker: each run processes every user with a
  `candidate_profiles` row (no fixed user id). It runs on the Mac during testing (`launchd` for
  scheduling) and will be deployed after successful tests. The service-role key lives only on the worker.
- Gmail: each user connects their own Gmail from JobChain (OAuth Web client, scope `gmail.send`);
  the worker sends with that user's stored refresh token. Up to 100 test users while the consent
  screen is in Testing; going public requires Google verification for the restricted scope.
- CV: `cv_path` is a local path for testing; a deployed worker needs CVs in Supabase Storage.

## Architecture

```
JobPilot (Python, local Mac)                 JobChain (Next.js)
  discover → extract → score → draft   ──►  Supabase  ◄──  /matches, /drafts, /profile, /applied
  send APPROVED drafts via Gmail        ◄──
```

- JobPilot writes with the Supabase **service-role key** (local `.env` only, never in Next.js).
- JobChain uses the anon key; RLS limits users to their own rows.
- Gmail OAuth credentials/token stay on the local machine.

## Database

Schema: `supabase/schema.sql` (run in Supabase SQL Editor on the new project).

| Table | Written by | Purpose |
|---|---|---|
| `profiles` | trigger on signup | identity (matches `docs/MVP_SCHEMA_AND_EVENTS.md`) |
| `jobs` | app (+ JobPilot after send) | existing bookmarks/applied tracking; new `applied_via`, `discovered_job_id` |
| `candidate_profiles` | app `/profile` | skills, experience, languages, sponsorship need, keywords, send mode/cap |
| `discovered_jobs` | JobPilot | scored vacancies with reasons/blockers/unknowns |
| `application_drafts` | JobPilot; app approves | `draft → approved/rejected` (app), `sending → sent/failed` (JobPilot only, enforced by trigger) |
| `pipeline_events` | JobPilot | run log / audit trail |

A partial unique index prevents sending twice for the same vacancy.

## Status

- [x] Gmail API enabled in Google Cloud project "My First Project"
- [ ] Gmail OAuth consent screen + test user + Desktop client → `credentials.json` (JobPilot folder, gitignored)
- [x] `supabase/schema.sql` written
- [x] Run schema on the new Supabase project (`cbomkfyaybbzpqluwfyf`)
- [x] `.env.local` / `.env.production` point at the new project (URL + publishable key)
- [ ] Verify existing app flows (sign up, bookmark, apply, status change) on the new DB
- [ ] (Later) Google sign-in: Web OAuth client (redirect `https://cbomkfyaybbzpqluwfyf.supabase.co/auth/v1/callback`),
  enable in Supabase, add `signInWithOAuth` button on `/login`. Keep consent screen in Testing while it
  shares the project with JobPilot's `gmail.send` scope, or use a separate Google Cloud project.

## Next steps

1. JobChain `/profile` page → `candidate_profiles`.
2. JobPilot Phase 1–4: config from Supabase, one source adapter, extraction, rule scoring → `discovered_jobs`.
3. JobChain `/matches` page (reuse `JobCard` + match badge and reasons, dismiss).
4. JobChain `/drafts` page (edit subject/body, approve/reject).
5. JobPilot Gmail OAuth + sender worker: send `approved` drafts, then upsert `jobs` row with
   `status='applied'`, `applied_via='email'`.
6. Later: follow-up reminders, skill-gap insights (aggregate `missing_skills`).
