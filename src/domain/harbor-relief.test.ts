import { describe, expect, it } from "vitest";
import { applyCommand, createDemoWorkspace } from "./engine";
import { harborReliefDefinition } from "./harbor-relief";
import { getActiveFields } from "./rules";

describe("Harbor Relief definition", () => {
  it("has stable unique IDs and reviewed plain-language labels", () => {
    const ids = [
      ...harborReliefDefinition.sections.map((section) => section.id),
      ...harborReliefDefinition.sections.flatMap((section) => section.fields.map((field) => field.id)),
      ...harborReliefDefinition.evidenceRules.map((rule) => rule.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      harborReliefDefinition.sections.every(
        (section) => section.plainTitle.trim() && section.fields.every((field) => field.plainLabel.trim()),
      ),
    ).toBe(true);
  });

  it("activates conditional fields only after their controlling answer", () => {
    const before = getActiveFields(harborReliefDefinition, {}).map((field) => field.id);
    const after = getActiveFields(harborReliefDefinition, { preferred_contact: "email" }).map(
      (field) => field.id,
    );

    expect(before).not.toContain("email");
    expect(after).toContain("email");
    expect(after).not.toContain("phone");
  });

  it("rejects writes to inactive conditional fields", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const outcome = applyCommand(harborReliefDefinition, workspace, {
      actor: "agent",
      requestId: "inactive-write",
      expectedRevision: 0,
      command: { type: "set-answer", fieldId: "email", value: "hidden@example.test" },
    });

    expect(outcome.result.code).toBe("INACTIVE_FIELD");
    expect(outcome.workspace.draft.answers.email).toBeUndefined();
  });

  it("stores XSS-looking text as inert data without interpreting it", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const payload = "<img src=x onerror=alert('no')>";
    const outcome = applyCommand(harborReliefDefinition, workspace, {
      actor: "human",
      requestId: "xss-fixture",
      expectedRevision: 0,
      command: { type: "set-answer", fieldId: "full_name", value: payload },
    });

    expect(outcome.result.ok).toBe(true);
    expect(outcome.workspace.draft.answers.full_name).toBe(payload);
  });
});

