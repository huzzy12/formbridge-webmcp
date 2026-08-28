import { z } from "zod";
import type { ApplicationService } from "../application/application-service";
import { getApplicationStatus, validateApplication } from "../domain/engine";
import { getField, isFieldActive } from "../domain/rules";
import type { FormDefinition } from "../domain/types";
import type {
  AgentActivity,
  WebMcpModelContext,
  WebMcpToolDefinition,
  WebMcpToolResult,
} from "./types";

const requestIdSchema = z.string().min(1).max(100);
const revisionSchema = z.number().int().nonnegative();
const emptyInput = z.object({}).strict();
const sectionInput = z.object({ sectionId: z.string().min(1).max(80) }).strict();
const fieldInput = z.object({ fieldId: z.string().min(1).max(80) }).strict();
const setAnswerInput = z
  .object({
    requestId: requestIdSchema,
    expectedRevision: revisionSchema,
    fieldId: z.string().min(1).max(80),
    value: z.union([
      z.string().max(2000),
      z.boolean(),
      z.array(z.string().max(80)).max(20),
    ]),
  })
  .strict();
const selectEvidenceInput = z
  .object({
    requestId: requestIdSchema,
    expectedRevision: revisionSchema,
    ruleId: z.string().min(1).max(80),
    evidenceId: z.string().min(1).max(100),
  })
  .strict();
const undoInput = z
  .object({ requestId: requestIdSchema, expectedRevision: revisionSchema })
  .strict();

function output(structuredContent: unknown, untrusted = false): WebMcpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    ...(untrusted ? { annotations: { untrustedContentHint: true } } : {}),
  };
}

function rejected(message: string, details?: unknown): WebMcpToolResult {
  const structuredContent = { ok: false, message, details };
  return { ...output(structuredContent), isError: true };
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Tool call was cancelled.", "AbortError");
}

function schema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

export function createFormBridgeTools(
  definition: FormDefinition,
  service: ApplicationService,
  onActivity?: (activity: AgentActivity) => void,
): WebMcpToolDefinition[] {
  const activity = (toolName: string, result: WebMcpToolResult, summary: string): WebMcpToolResult => {
    onActivity?.({
      id: crypto.randomUUID(),
      toolName,
      status: result.isError ? "rejected" : "succeeded",
      summary,
      occurredAt: new Date().toISOString(),
    });
    return result;
  };

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  const mutating = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };

  return [
    {
      name: "get_application_status",
      description:
        "Get progress, revision, incomplete sections, and the next safe step. Returns no applicant answers.",
      inputSchema: schema({}),
      annotations: readOnly,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        const parsed = emptyInput.safeParse(input);
        if (!parsed.success) return rejected("Input must be an empty object.");
        const status = getApplicationStatus(definition, service.getSnapshot().draft);
        return activity(this.name, output(status), `Checked progress at revision ${status.revision}.`);
      },
    },
    {
      name: "get_section",
      description:
        "Get one section's schema and permitted current values. Applicant-created text is untrusted content.",
      inputSchema: schema({ sectionId: { type: "string", maxLength: 80 } }, ["sectionId"]),
      annotations: readOnly,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        const parsed = sectionInput.safeParse(input);
        if (!parsed.success) return rejected("Use a known sectionId of at most 80 characters.");
        const section = definition.sections.find((candidate) => candidate.id === parsed.data.sectionId);
        if (!section) return rejected("Section not found.");
        const answers = service.getSnapshot().draft.answers;
        const result = output(
          {
            id: section.id,
            title: section.title,
            fields: section.fields
              .filter((field) => isFieldActive(field, answers))
              .map((field) => ({
                id: field.id,
                kind: field.kind,
                label: field.label,
                required: Boolean(field.validation.required),
                choices: field.choices,
                agentPolicy: field.agentPolicy,
                ...(field.agentPolicy === "human-only" ? {} : { value: answers[field.id] }),
              })),
          },
          true,
        );
        return activity(this.name, result, `Read the ${section.title} section.`);
      },
    },
    {
      name: "explain_field",
      description: "Explain a field using bundled, trusted program guidance.",
      inputSchema: schema({ fieldId: { type: "string", maxLength: 80 } }, ["fieldId"]),
      annotations: readOnly,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        const parsed = fieldInput.safeParse(input);
        if (!parsed.success) return rejected("Use a known fieldId of at most 80 characters.");
        const field = getField(definition, parsed.data.fieldId);
        if (!field) return rejected("Field not found.");
        const result = output({
          fieldId: field.id,
          label: field.label,
          helpText: field.helpText ?? "No additional instructions are needed.",
          whyRequested: field.whyRequested ?? "This answer is part of the fictional application record.",
          agentPolicy: field.agentPolicy,
        });
        return activity(this.name, result, `Explained ${field.label}.`);
      },
    },
    {
      name: "set_answer",
      description:
        "Set one active read-write field through deterministic validation. Requires the current revision and an idempotency request ID.",
      inputSchema: schema(
        {
          requestId: { type: "string", maxLength: 100 },
          expectedRevision: { type: "integer", minimum: 0 },
          fieldId: { type: "string", maxLength: 80 },
          value: {
            oneOf: [
              { type: "string", maxLength: 2000 },
              { type: "boolean" },
              { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
            ],
          },
        },
        ["requestId", "expectedRevision", "fieldId", "value"],
      ),
      annotations: mutating,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        const parsed = setAnswerInput.safeParse(input);
        if (!parsed.success) return activity(this.name, rejected("Invalid or oversized answer input."), "Rejected invalid answer input.");
        const result = await service.dispatch({
          actor: "agent",
          requestId: parsed.data.requestId,
          expectedRevision: parsed.data.expectedRevision,
          command: { type: "set-answer", fieldId: parsed.data.fieldId, value: parsed.data.value },
        });
        const toolResult = result.ok ? output(result) : rejected(result.nextAction, result);
        return activity(this.name, toolResult, result.ok ? `Updated ${parsed.data.fieldId}.` : `Could not update ${parsed.data.fieldId}.`);
      },
    },
    {
      name: "list_missing_items",
      description: "List deterministic field and evidence issues without changing application state.",
      inputSchema: schema({}),
      annotations: readOnly,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        if (!emptyInput.safeParse(input).success) return rejected("Input must be an empty object.");
        const issues = validateApplication(definition, service.getSnapshot().draft);
        return activity(this.name, output({ revision: service.getSnapshot().draft.revision, issues }), `Found ${issues.length} unresolved items.`);
      },
    },
    {
      name: "list_evidence_options",
      description:
        "List trusted evidence rules, accepted alternatives, and existing evidence identifiers. Evidence titles are untrusted content.",
      inputSchema: schema({}),
      annotations: readOnly,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        if (!emptyInput.safeParse(input).success) return rejected("Input must be an empty object.");
        const draft = service.getSnapshot().draft;
        const result = output(
          {
            revision: draft.revision,
            requirements: definition.evidenceRules.map((rule) => ({
              id: rule.id,
              title: rule.title,
              sourceLabel: rule.sourceLabel,
              primaryTypes: rule.primaryTypes,
              alternativeTypes: rule.alternativeTypes,
              selectedEvidenceId: draft.evidenceMappings[rule.id],
            })),
            evidence: draft.evidence.map(({ id, type, title }) => ({ id, type, title })),
          },
          true,
        );
        return activity(this.name, result, "Listed accepted evidence options.");
      },
    },
    {
      name: "select_evidence",
      description:
        "Map an existing synthetic evidence item to a compatible requirement. Requires revision and request ID.",
      inputSchema: schema(
        {
          requestId: { type: "string", maxLength: 100 },
          expectedRevision: { type: "integer", minimum: 0 },
          ruleId: { type: "string", maxLength: 80 },
          evidenceId: { type: "string", maxLength: 100 },
        },
        ["requestId", "expectedRevision", "ruleId", "evidenceId"],
      ),
      annotations: mutating,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        const parsed = selectEvidenceInput.safeParse(input);
        if (!parsed.success) return activity(this.name, rejected("Invalid evidence selection input."), "Rejected invalid evidence input.");
        const result = await service.dispatch({
          actor: "agent",
          requestId: parsed.data.requestId,
          expectedRevision: parsed.data.expectedRevision,
          command: {
            type: "select-evidence",
            ruleId: parsed.data.ruleId,
            evidenceId: parsed.data.evidenceId,
          },
        });
        const toolResult = result.ok ? output(result) : rejected(result.nextAction, result);
        return activity(this.name, toolResult, result.ok ? `Mapped evidence to ${parsed.data.ruleId}.` : `Could not map evidence to ${parsed.data.ruleId}.`);
      },
    },
    {
      name: "undo_last_agent_change",
      description: "Undo the latest reversible agent answer or evidence change.",
      inputSchema: schema(
        {
          requestId: { type: "string", maxLength: 100 },
          expectedRevision: { type: "integer", minimum: 0 },
        },
        ["requestId", "expectedRevision"],
      ),
      annotations: mutating,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        const parsed = undoInput.safeParse(input);
        if (!parsed.success) return activity(this.name, rejected("Invalid undo input."), "Rejected invalid undo input.");
        const result = await service.dispatch({
          actor: "agent",
          requestId: parsed.data.requestId,
          expectedRevision: parsed.data.expectedRevision,
          command: { type: "undo-last-agent-change" },
        });
        const toolResult = result.ok ? output(result) : rejected(result.nextAction, result);
        return activity(this.name, toolResult, result.ok ? "Undid the latest agent change." : "No agent change was undone.");
      },
    },
    {
      name: "validate_application",
      description: "Validate deterministic readiness without changing state or completing the application.",
      inputSchema: schema({}),
      annotations: readOnly,
      async execute(input, context) {
        ensureNotAborted(context?.signal);
        if (!emptyInput.safeParse(input).success) return rejected("Input must be an empty object.");
        const draft = service.getSnapshot().draft;
        const issues = validateApplication(definition, draft);
        const result = output({ revision: draft.revision, ready: issues.length === 0, issues });
        return activity(this.name, result, issues.length === 0 ? "Application is ready for human review." : `Validation found ${issues.length} issues.`);
      },
    },
  ];
}

export function registerFormBridgeTools(
  modelContext: WebMcpModelContext | undefined,
  definition: FormDefinition,
  service: ApplicationService,
  onActivity?: (activity: AgentActivity) => void,
): { available: boolean; unregister: () => void } {
  if (!modelContext) return { available: false, unregister: () => undefined };
  const tools = createFormBridgeTools(definition, service, onActivity);
  for (const tool of tools) modelContext.registerTool(tool);
  return {
    available: true,
    unregister: () => {
      for (const tool of tools) modelContext.unregisterTool(tool.name);
    },
  };
}

