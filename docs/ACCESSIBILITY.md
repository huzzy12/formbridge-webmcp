# Accessibility

FormBridge targets WCAG 2.2 AA and prioritizes a stressed applicant using keyboard, zoom, or assistive technology.

## Implemented

- Semantic headings, landmarks, fieldsets, legends, labels, buttons, inputs, selects, details, descriptions, and print structure.
- Skip navigation, strong visible focus, 18px base copy, 1.55 line height, 44px-or-larger primary targets, and no color-only status.
- Standard and one-question plain modes share the same answers and preserve context.
- Linked error summary, per-field errors, `aria-invalid`, a polite live region, and visible agent-change indicators.
- Mobile/small-width single-column reflow, reduced-motion rules, and A4/US Letter friendly print CSS.
- Human-only controls are explained in visible text as well as iconography.

## Verified locally

- Desktop Chrome and Pixel 7 emulation golden paths.
- No horizontal page overflow in the narrow mobile test.
- Zero axe serious/critical violations on the welcome and review screens at both tested viewports.
- Standard/plain answer equivalence.

Commands:

```bash
npm run test:e2e
npm run test:a11y
```

## Manual release checks still required

- Complete keyboard-only pass from first focus through print.
- Chrome + NVDA and Windows Narrator smoke tests for labels, headings, errors, live updates, evidence status, review, and attestation.
- Browser zoom at 200% and 400% using real zoom controls.
- Printed A4 and US Letter inspection from the live deployment.

Automated checks support but do not replace these manual assistive-technology checks.

