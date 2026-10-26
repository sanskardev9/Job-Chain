# JobChain Attestation and Smart-Contract Data Design (MVP)

## Recommended Approach
Use Ethereum Attestation Service (EAS) schemas and attestations instead of custom contracts for MVP speed and interoperability.

## Network
- Preferred: Base or Polygon.
- Keep environment-configurable (`NEXT_PUBLIC_CHAIN_ID`, `EAS_CONTRACT_ADDRESS`).

## Schema Strategy
Create separate EAS schemas for core lifecycle events.

### 1) Offer Issued Schema
Fields:
- `bytes32 recordId`
- `address employerSigner`
- `address candidateWallet`
- `string organizationId`
- `string jobTitle`
- `string compensationDigest` (hash or redacted summary)
- `uint64 joiningDate`
- `uint32 noticeDays`
- `bytes32 offerDocHash`
- `uint64 issuedAt`

### 2) Offer Accepted Schema
Fields:
- `bytes32 recordId`
- `address candidateSigner`
- `bytes32 offerAttestationUid`
- `uint64 acceptedAt`

### 3) Employment Started Schema
Fields:
- `bytes32 recordId`
- `address employerSigner`
- `address candidateWallet`
- `uint64 startDate`
- `uint64 confirmedAt`

### 4) Employment Exited Schema
Fields:
- `bytes32 recordId`
- `address employerSigner`
- `uint64 lastWorkingDate`
- `string exitType`
- `bool noticeCompleted`
- `bytes32 relievingDocHash`
- `uint64 confirmedAt`

## Hashing and Privacy
- Store raw documents off-chain.
- Compute SHA-256 for files and include hash in attestation fields/payload.
- For sensitive terms (salary/equity), store either digest or encrypted reference rather than plaintext.

## Linking On-chain and Off-chain
- `employment_records.id` -> deterministic `bytes32 recordId`.
- Save `attestation_uid` and transaction hash in `employment_events`.
- Verification UI checks:
  1. Event exists in Postgres.
  2. Linked EAS attestation UID exists on chain.
  3. Stored document hash equals recomputed file hash.

## Signature Policy
- Employer lifecycle events require authorized organization signer.
- Candidate-acceptance events require candidate wallet signature.
- Optional: dual signature in app DB even when one on-chain signer is canonical.

## Dispute Handling (MVP)
- Never mutate historic events.
- Add a `disputed` event referencing disputed `attestation_uid`.
- Append resolution event with final status.

## Implementation Notes
- Start with single attestation issuer service account for smoother UX if needed.
- Progressively move to direct wallet signing for both sides.
- Keep schema versioning explicit (`offer_issued_v1`, etc.).
