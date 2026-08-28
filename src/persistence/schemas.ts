import { z } from "zod";

const validationIssueSchema = z
  .object({
    id: z.string().max(180),
    code: z.enum(["required", "invalid", "missing-evidence"]),
    message: z.string().max(500),
    sectionId: z.string().max(80).optional(),
    fieldId: z.string().max(80).optional(),
    ruleId: z.string().max(80).optional(),
  })
  .strict();

const commandResultSchema = z
  .object({
    ok: z.boolean(),
    code: z
      .enum([
        "INVALID_COMMAND",
        "INVALID_VALUE",
        "NOT_FOUND",
        "POLICY_DENIED",
        "REVISION_CONFLICT",
        "INACTIVE_FIELD",
        "NOT_READY",
        "NOTHING_TO_UNDO",
      ])
      .optional(),
    revision: z.number().int().nonnegative(),
    changedFieldIds: z.array(z.string().max(80)).max(50),
    issues: z.array(validationIssueSchema).max(100),
    nextAction: z.string().max(500),
  })
  .strict();

export const applicationWorkspaceSchema = z
  .object({
    draft: z
      .object({
        id: z.string().max(100),
        formId: z.string().max(100),
        formVersion: z.number().int().positive(),
        revision: z.number().int().nonnegative(),
        status: z.enum(["not-started", "in-progress", "ready-for-review", "completed"]),
        answers: z.record(z.string().max(80), z.unknown()),
        evidence: z
          .array(
            z
              .object({
                id: z.string().max(100),
                type: z.string().max(80),
                title: z.string().max(180),
                description: z.string().max(1000),
                createdAt: z.iso.datetime(),
              })
              .strict(),
          )
          .max(30),
        evidenceMappings: z.record(z.string().max(80), z.string().max(100)),
        attestation: z
          .object({ initials: z.string().max(4), attestedAt: z.iso.datetime() })
          .strict()
          .nullable(),
        updatedAt: z.iso.datetime(),
      })
      .strict(),
    auditEvents: z
      .array(
        z
          .object({
            id: z.string().max(180),
            revision: z.number().int().nonnegative(),
            actor: z.enum(["human", "agent", "system"]),
            action: z.string().max(80),
            entityIds: z.array(z.string().max(100)).max(20),
            occurredAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(500),
    undoStack: z
      .array(
        z
          .object({
            kind: z.enum(["answer", "evidence"]),
            entityId: z.string().max(100),
            previousValue: z.unknown().optional(),
            resultingRevision: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(20),
    processedRequests: z.record(z.string().max(100), commandResultSchema),
  })
  .strict();

