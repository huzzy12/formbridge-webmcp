# Guided demo runbook

## Setup

Open the app in a WebMCP-capable browser, choose **Try the guided demo**, and keep the visible synthetic profile expanded. Never enter real personal information.

## Suggested agent request

> Help me prepare this fictional Harbor Relief application using the synthetic Jordan Lee profile shown on the page. Fill only permitted fields, validate the application, and resolve accepted evidence alternatives. Do not guess, consent, attest, or claim submission.

## Expected safe sequence

1. `get_application_status` returns revision and progress without raw answers.
2. `get_section` and `explain_field` provide current permitted schema/help.
3. `set_answer` fills active `read-write` fields with a unique request ID and current revision.
4. An attempt to set `consent_to_contact` returns `POLICY_DENIED`; the human completes it.
5. `list_missing_items` identifies proof of occupancy.
6. `list_evidence_options` shows that `shelter-statement` is an accepted alternative.
7. `select_evidence` maps `evidence_shelter_letter` to `proof_occupancy`.
8. `validate_application` reports readiness only after all deterministic requirements pass.
9. The human reviews, attests, types initials, and selects **Prepare packet locally**.

The final screen must say **Packet prepared locally** and **Nothing was submitted**.

## Failure demonstrations

- Repeat the same mutating request ID: no extra revision or audit event is created.
- Send a stale expected revision: the newer human answer is preserved.
- Try an oversized answer or unknown property: strict parsing rejects the call.
- Use **Undo latest agent change**: the most recent reversible agent mutation is restored visibly.
- Open in a browser without WebMCP: the full manual path remains available.

