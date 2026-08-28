import { describe, expect, it, vi } from "vitest";
import { ApplicationService } from "../application/application-service";
import { harborReliefDefinition } from "../domain/harbor-relief";
import type { ApplicationWorkspace } from "../domain/types";
import type { DraftRepository } from "../persistence/repository";
import { createFormBridgeTools, registerFormBridgeTools } from "./adapter";
import type { WebMcpModelContext, WebMcpToolDefinition } from "./types";

class MemoryRepository implements DraftRepository {
  workspace: ApplicationWorkspace | null = null;
  async load() { return this.workspace; }
  async save(workspace: ApplicationWorkspace) { this.workspace = structuredClone(workspace); }
  async clear() { this.workspace = null; return true; }
  async hasDraft() { return this.workspace !== null; }
}

function setup() {
  const service = new ApplicationService(harborReliefDefinition, new MemoryRepository());
  return { service, tools: createFormBridgeTools(harborReliefDefinition, service) };
}

describe("WebMCP adapter", () => {
  it("registers exactly the nine least-privilege tools and unregisters cleanly", () => {
    const registered: WebMcpToolDefinition[] = [];
    const unregisterTool = vi.fn();
    const context: WebMcpModelContext = {
      registerTool: (tool) => registered.push(tool),
      unregisterTool,
    };
    const { service } = setup();
    const registration = registerFormBridgeTools(context, harborReliefDefinition, service);

    expect(registered.map((tool) => tool.name)).toEqual([
      "get_application_status",
      "get_section",
      "explain_field",
      "set_answer",
      "list_missing_items",
      "list_evidence_options",
      "select_evidence",
      "undo_last_agent_change",
      "validate_application",
    ]);
    expect(registered.some((tool) => /submit|attest|complete|clear|upload/.test(tool.name))).toBe(false);
    registration.unregister();
    expect(unregisterTool).toHaveBeenCalledTimes(9);
  });

  it("marks read-only tools and untrusted applicant content", async () => {
    const { tools } = setup();
    const statusTool = tools.find((tool) => tool.name === "get_application_status")!;
    const sectionTool = tools.find((tool) => tool.name === "get_section")!;

    expect(statusTool.annotations?.readOnlyHint).toBe(true);
    const result = await sectionTool.execute({ sectionId: "impact" });
    expect(result.annotations?.untrustedContentHint).toBe(true);
  });

  it("keeps raw answers out of application status and human-only values out of sections", async () => {
    const { tools, service } = setup();
    await service.replaceWithDemo(true);
    const status = await tools.find((tool) => tool.name === "get_application_status")!.execute({});
    const section = await tools.find((tool) => tool.name === "get_section")!.execute({ sectionId: "contact" });

    expect(JSON.stringify(status.structuredContent)).not.toContain("Jordan Lee");
    const sectionText = JSON.stringify(section.structuredContent);
    expect(sectionText).toContain("consent_to_contact");
    expect(sectionText).not.toContain('"value":true');
  });

  it("rejects unknown properties, oversized strings, and human-only fields", async () => {
    const { tools, service } = setup();
    const setAnswer = tools.find((tool) => tool.name === "set_answer")!;
    const revision = service.getSnapshot().draft.revision;

    expect((await setAnswer.execute({ requestId: "x", expectedRevision: revision, fieldId: "damage_summary", value: "ok", extra: true })).isError).toBe(true);
    expect((await setAnswer.execute({ requestId: "y", expectedRevision: revision, fieldId: "damage_summary", value: "x".repeat(2001) })).isError).toBe(true);
    const denied = await setAnswer.execute({ requestId: "z", expectedRevision: revision, fieldId: "consent_to_contact", value: true });
    expect(denied.isError).toBe(true);
    expect(service.getSnapshot().draft.answers.consent_to_contact).toBeUndefined();
  });

  it("honors cancellation before any mutation", async () => {
    const { tools, service } = setup();
    const setAnswer = tools.find((tool) => tool.name === "set_answer")!;
    const controller = new AbortController();
    controller.abort();

    await expect(
      setAnswer.execute(
        { requestId: "cancelled", expectedRevision: 0, fieldId: "damage_summary", value: "No write" },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(service.getSnapshot().draft.revision).toBe(0);
  });
});
