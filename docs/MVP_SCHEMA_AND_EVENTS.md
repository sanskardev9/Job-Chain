# JobChain MVP Schema and Event Model

## Data Architecture
- Postgres (Supabase): app state, permissions, searchable metadata.
- Storage (Supabase): original documents.
- Attestation layer (EAS): signed, immutable proof references.

## Core Tables

### `profiles`
- `id` uuid pk (maps to auth user)
- `full_name` text
- `role` text check in (`candidate`,`employer_admin`,`employer_member`)
- `wallet_address` text nullable unique
- `created_at` timestamptz

### `organizations`
- `id` uuid pk
- `name` text
- `legal_name` text nullable
- `website` text
- `verification_status` text check in (`pending`,`verified`,`rejected`)
- `created_by` uuid fk `profiles.id`
- `created_at` timestamptz

### `organization_members`
- `id` uuid pk
- `organization_id` uuid fk
- `user_id` uuid fk `profiles.id`
- `member_role` text check in (`owner`,`hr_admin`,`recruiter`,`viewer`)
- `can_sign_records` boolean default false
- `wallet_address` text nullable
- `created_at` timestamptz

### `employment_records`
- `id` uuid pk
- `candidate_id` uuid fk `profiles.id`
- `organization_id` uuid fk
- `job_title` text
- `employment_type` text nullable
- `status` text check in (`offered`,`accepted`,`active`,`exited`,`disputed`)
- `start_date` date nullable
- `end_date` date nullable
- `created_at` timestamptz

### `employment_events`
- `id` uuid pk
- `employment_record_id` uuid fk
- `event_type` text check in (`offer_issued`,`offer_accepted`,`employment_started`,`employment_exited`,`document_attached`)
- `event_time` timestamptz
- `actor_user_id` uuid fk `profiles.id`
- `actor_org_member_id` uuid fk nullable
- `details_json` jsonb
- `attestation_uid` text nullable
- `tx_hash` text nullable
- `created_at` timestamptz

### `documents`
- `id` uuid pk
- `employment_record_id` uuid fk
- `document_type` text check in (`offer_letter`,`contract`,`experience_letter`,`relieving_letter`,`other`)
- `storage_path` text
- `sha256_hash` text
- `uploaded_by` uuid fk `profiles.id`
- `attestation_uid` text nullable
- `created_at` timestamptz

### `event_signatures`
- `id` uuid pk
- `employment_event_id` uuid fk
- `signer_user_id` uuid fk `profiles.id`
- `signer_wallet` text
- `signature_type` text check in (`wallet`,`platform_key`)
- `signature_payload_hash` text
- `created_at` timestamptz

## Event Modeling Rules
- Every lifecycle change must create an append-only `employment_events` row.
- `employment_records.status` is derived from latest valid event.
- `details_json` stores human-readable fields used for display and auditing.
- If a document is attached, include its hash in event payload.

## Example `details_json`

### `offer_issued`
```json
{
  "salary": { "currency": "INR", "amount_annual": 1800000 },
  "equity": "0.2%",
  "joining_date": "2026-07-01",
  "notice_period_days": 60,
  "work_mode": "hybrid"
}
```

### `employment_exited`
```json
{
  "last_working_date": "2028-03-31",
  "exit_type": "resigned",
  "notice_completed": true,
  "relieving_status": "issued"
}
```

## Access Policy (MVP)
- Candidate can read their own records and share verification links.
- Employer members can read records belonging to their org.
- Only authorized signers can create attestable events for org.
- Sensitive compensation fields can be redacted in public share mode.
