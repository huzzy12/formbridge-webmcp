import { describe, expect, it } from "vitest";
import { harborReliefDefinition } from "./harbor-relief";
import {
  applyCommand,
  createDemoWorkspace,
  getApplicationStatus,
  validateApplication,
} from "./engine";
import type { CommandEnvelope } from "./types";

function envelope(
  expectedRevision: number,
  command: CommandEnvelope["command"],
  actor: CommandEnvelope["actor"] = "agent",
  requestId: string = crypto.randomUUID(),
): CommandEnvelope {
  return { actor, command, expectedRevision, requestId };
}

describe("FormBridge command seam", () => {
  it("lets an agent update permitted fields through the shared command path", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const outcome = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(workspace.draft.revision, {
        type: "set-answer",
        fieldId: "damage_summary",
        value: "Flood water damaged the kitchen and first-floor walls.",
      }),
    );

    expect(outcome.result.ok).toBe(true);
    expect(outcome.workspace.draft.answers.damage_summary).toBe(
      "Flood water damaged the kitchen and first-floor walls.",
    );
    expect(outcome.workspace.draft.revision).toBe(1);
    expect(outcome.workspace.auditEvents).toHaveLength(1);
  });

  it("fails closed when an agent attempts a human-only action", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const outcome = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(workspace.draft.revision, {
        type: "set-answer",
        fieldId: "consent_to_contact",
        value: true,
      }),
    );

    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.code).toBe("POLICY_DENIED");
    expect(outcome.workspace).toEqual(workspace);
  });

  it("rejects stale writes so an agent cannot overwrite newer human work", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const humanUpdate = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(
        workspace.draft.revision,
        { type: "set-answer", fieldId: "damage_summary", value: "Human description" },
        "human",
      ),
    );
    const staleAgentUpdate = applyCommand(
      harborReliefDefinition,
      humanUpdate.workspace,
      envelope(0, {
        type: "set-answer",
        fieldId: "damage_summary",
        value: "Agent description",
      }),
    );

    expect(staleAgentUpdate.result.code).toBe("REVISION_CONFLICT");
    expect(staleAgentUpdate.workspace.draft.answers.damage_summary).toBe("Human description");
  });

  it("replays duplicate request IDs without a second mutation or audit event", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const request = envelope(
      workspace.draft.revision,
      { type: "set-answer", fieldId: "adult_count", value: "2" },
      "agent",
      "request-123",
    );
    const first = applyCommand(harborReliefDefinition, workspace, request);
    const replay = applyCommand(harborReliefDefinition, first.workspace, request);

    expect(replay.result).toEqual(first.result);
    expect(replay.workspace.draft.revision).toBe(1);
    expect(replay.workspace.auditEvents).toHaveLength(1);
  });

  it("resolves proof of occupancy with an accepted alternative", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const outcome = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(workspace.draft.revision, {
        type: "select-evidence",
        ruleId: "proof_occupancy",
        evidenceId: "evidence_shelter_letter",
      }),
    );

    expect(outcome.result.ok).toBe(true);
    expect(outcome.workspace.draft.evidenceMappings.proof_occupancy).toBe(
      "evidence_shelter_letter",
    );
  });

  it("requires deterministic completeness and human attestation", () => {
    let workspace = createDemoWorkspace(harborReliefDefinition, { completedAnswers: true });
    for (const [ruleId, evidenceId] of [
      ["proof_identity", "evidence_photo_id"],
      ["proof_occupancy", "evidence_shelter_letter"],
      ["damage_documentation", "evidence_damage_photo"],
    ] as const) {
      workspace = applyCommand(
        harborReliefDefinition,
        workspace,
        envelope(workspace.draft.revision, { type: "select-evidence", ruleId, evidenceId }),
      ).workspace;
    }

    expect(validateApplication(harborReliefDefinition, workspace.draft)).toHaveLength(0);
    expect(getApplicationStatus(harborReliefDefinition, workspace.draft).status).toBe(
      "ready-for-review",
    );

    const agentAttempt = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(workspace.draft.revision, {
        type: "attest-and-complete",
        confirmed: true,
        initials: "JL",
      }),
    );
    expect(agentAttempt.result.code).toBe("POLICY_DENIED");

    const humanCompletion = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(
        workspace.draft.revision,
        { type: "attest-and-complete", confirmed: true, initials: "JL" },
        "human",
      ),
    );
    expect(humanCompletion.result.ok).toBe(true);
    expect(humanCompletion.workspace.draft.status).toBe("completed");
  });

  it("undoes the latest reversible agent mutation", () => {
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const updated = applyCommand(
      harborReliefDefinition,
      workspace,
      envelope(workspace.draft.revision, {
        type: "set-answer",
        fieldId: "damage_summary",
        value: "A changed answer",
      }),
    );
    const undone = applyCommand(
      harborReliefDefinition,
      updated.workspace,
      envelope(updated.workspace.draft.revision, { type: "undo-last-agent-change" }, "human"),
    );

    expect(undone.result.ok).toBe(true);
    expect(undone.workspace.draft.answers.damage_summary).toBeUndefined();
  });
});
