# Security and privacy model

## Trust boundaries

- Trusted: bundled, versioned Harbor Relief field/help/evidence definitions.
- Untrusted: answers, evidence titles/descriptions, IndexedDB records, and every WebMCP argument.
- Authoritative: only deterministic domain validation and policy checks.
- Local but not secret: IndexedDB is convenient persistence, not a secure vault. The UI tells users to use synthetic details only.

## Controls

- Strict Zod parsing rejects unknown properties and oversized tool/storage values.
- No `eval`, dynamic code, remote HTML, raw Markdown, `dangerouslySetInnerHTML`, third-party embeds, telemetry, cookies, service worker, secrets, or background sync.
- React renders untrusted strings as text. The seeded shelter letter contains a prompt-injection fixture that is neither executed nor returned in general-purpose tool output.
- There is no submit, attest, complete, clear, or upload WebMCP tool.
- Human-only and inactive fields reject agent writes.
- Evidence IDs can be mapped only when their deterministic type is accepted by the selected rule.
- Mutations are revision-safe, idempotent, audited, cancellable before dispatch, and reversible where appropriate.
- Clear data uses a native human confirmation and verifies deletion.
- Production headers deny framing, objects, unnecessary device capabilities, referrers, and off-origin code/content.
- Production source maps are disabled.

## Security verification

Unit coverage includes stale writes, duplicate calls, policy denial, inactive fields, oversized calls, unknown properties, corrupted storage, cancellation, XSS-shaped text, prompt-injection fixtures, evidence compatibility, undo, and human-only finalization.

Run:

```bash
npm run test
npm run test:webmcp
npm audit --omit=dev
```

This demonstration is not appropriate for real personal data or real aid decisions.

