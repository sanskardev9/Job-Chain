# JobChain PRD (One Page)

## Product
JobChain is employment trust infrastructure: a shared, verifiable record of employment events that reduces fraud, disputes, and verification time.

## Problem
Hiring depends on tamperable artifacts (PDFs, emails, calls). Candidates can fake history and employers can deny agreed terms. Verification is expensive and slow.

## Users
- Employees/Candidates: need portable, trusted proof of career history.
- Employers/HR: need fast, reliable verification and auditable hiring records.
- Verifiers (future): need API-first access to trusted employment data.

## Value Propositiona
- Immutable lifecycle records signed by authorized parties.
- Mutual accountability for both employee and employer.
- Faster, lower-cost verification with less manual back-and-forth.

## MVP Scope (Phase 1)
- Candidate account: email/wallet auth, profile, timeline view.
- Employer account: company profile, authorized HR wallets, issue records.
- Core records: offer issued, offer accepted, employment started, employment exited.
- Verifiable docs: file stored off-chain, hash + metadata on-chain/off-chain attestations.
- Public verification view (permissioned by share link).

## Non-Goals (MVP)
- Full ATS replacement.
- Payroll/compliance integrations.
- AI career coaching and advanced reputation scoring.

## User Stories
- As a candidate, I can share a trusted timeline proving role, duration, and offer terms.
- As an employer, I can issue and sign offer/employment records that cannot be altered silently.
- As a recruiter, I can verify a candidate’s employment events instantly from signed attestations.

## Core Flows
1. Employer creates org profile and verifies ownership.
2. Employer issues offer record with terms.
3. Candidate accepts offer.
4. Employer confirms join event.
5. Employer records exit event.
6. Candidate shares verification link to third party.

## Success Metrics
- Time to verify employment history (target: <5 minutes).
- Percentage of records with dual-party signature.
- Number of verified organizations and active HR signers.
- Dispute rate on offer/exit details.
- Retention: candidates returning to reuse verified timeline.

## Risks
- Legal/privacy concerns around salary and employment metadata.
- Employer onboarding friction (identity + signer authorization).
- Chain/network fees and UX complexity for non-crypto users.

## MVP Principles
- Privacy-first defaults with explicit consent.
- Human-readable records backed by cryptographic proofs.
- Progressive decentralization: usable with web2 UX, trust anchored in attestations.
