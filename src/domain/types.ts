export type AgentPolicy = "read-write" | "read-only" | "human-only";

export type DraftStatus =
  | "not-started"
  | "in-progress"
  | "ready-for-review"
  | "completed";

export type RuleExpression =
  | { op: "equals"; fieldId: string; value: unknown }
  | { op: "includes"; fieldId: string; value: unknown }
  | { op: "exists"; fieldId: string }
  | { op: "and"; rules: RuleExpression[] }
  | { op: "or"; rules: RuleExpression[] }
  | { op: "not"; rule: RuleExpression };

export interface ValidationDefinition {
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: "email" | "phone" | "initials";
}

export interface ChoiceDefinition {
  value: string;
  label: string;
}

export interface FieldDefinition {
  id: string;
  sectionId: string;
  kind: "text" | "textarea" | "date" | "radio" | "checkbox" | "select";
  label: string;
  plainLabel: string;
  helpText?: string;
  whyRequested?: string;
  requiredWhen?: RuleExpression;
  validation: ValidationDefinition;
  agentPolicy: AgentPolicy;
  autocomplete?: string;
  choices?: ChoiceDefinition[];
}

export interface SectionDefinition {
  id: string;
  title: string;
  plainTitle: string;
  description: string;
  fields: FieldDefinition[];
}

export interface EvidenceRule {
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  sourceDetail: string;
  primaryTypes: string[];
  alternativeTypes: string[];
}

export interface FormDefinition {
  id: string;
  version: number;
  title: string;
  disclaimer: string;
  sections: SectionDefinition[];
  evidenceRules: EvidenceRule[];
}

export interface EvidenceItem {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface HumanAttestation {
  initials: string;
  attestedAt: string;
}

export interface ApplicationDraft {
  id: string;
  formId: string;
  formVersion: number;
  revision: number;
  status: DraftStatus;
  answers: Record<string, unknown>;
  evidence: EvidenceItem[];
  evidenceMappings: Record<string, string>;
  attestation: HumanAttestation | null;
  updatedAt: string;
}

export type ApplicationCommand =
  | { type: "set-answer"; fieldId: string; value: unknown }
  | { type: "select-evidence"; ruleId: string; evidenceId: string }
  | { type: "undo-last-agent-change" }
  | { type: "attest-and-complete"; confirmed: boolean; initials: string };

export interface CommandEnvelope {
  requestId: string;
  expectedRevision: number;
  actor: "human" | "agent" | "system";
  command: ApplicationCommand;
}

export type CommandErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_VALUE"
  | "NOT_FOUND"
  | "POLICY_DENIED"
  | "REVISION_CONFLICT"
  | "INACTIVE_FIELD"
  | "NOT_READY"
  | "NOTHING_TO_UNDO";

export interface ValidationIssue {
  id: string;
  code: "required" | "invalid" | "missing-evidence";
  message: string;
  sectionId?: string;
  fieldId?: string;
  ruleId?: string;
}

export interface CommandResult {
  ok: boolean;
  code?: CommandErrorCode;
  revision: number;
  changedFieldIds: string[];
  issues: ValidationIssue[];
  nextAction: string;
}

export interface AuditEvent {
  id: string;
  revision: number;
  actor: "human" | "agent" | "system";
  action: string;
  entityIds: string[];
  occurredAt: string;
}

export interface UndoRecord {
  kind: "answer" | "evidence";
  entityId: string;
  previousValue?: unknown;
  resultingRevision: number;
}

export interface ApplicationWorkspace {
  draft: ApplicationDraft;
  auditEvents: AuditEvent[];
  undoStack: UndoRecord[];
  processedRequests: Record<string, CommandResult>;
}

export interface ApplicationStatus {
  status: DraftStatus;
  revision: number;
  completedFields: number;
  totalActiveFields: number;
  progressPercent: number;
  incompleteSections: string[];
  issueCount: number;
  nextAction: string;
}

