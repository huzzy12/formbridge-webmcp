import { getActiveFields, hasAnswer } from "./rules";
import type { ApplicationDraft, FieldDefinition, FormDefinition, ValidationIssue } from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-\s\d]{7,30}$/;

export function validateFieldValue(field: FieldDefinition, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (field.kind === "checkbox" && field.choices) {
    if (!Array.isArray(value) || !value.every((entry: unknown): entry is string => typeof entry === "string")) {
      return "Choose one or more listed options.";
    }
    const allowed = new Set(field.choices.map((entry) => entry.value));
    if (value.some((entry) => !allowed.has(entry))) return "Choose only listed options.";
  } else if (field.kind === "checkbox") {
    if (typeof value !== "boolean") return "Use true or false for this checkbox.";
  } else if (typeof value !== "string") {
    return "Enter a text value.";
  }

  if (typeof value === "string") {
    if (field.validation.maxLength && value.length > field.validation.maxLength) {
      return `Use ${field.validation.maxLength} characters or fewer.`;
    }
    if (field.choices && !field.choices.some((choice) => choice.value === value)) {
      return "Choose one of the listed options.";
    }
    if (field.validation.pattern === "email" && !EMAIL.test(value)) {
      return "Enter an email address in the format name@example.org.";
    }
    if (field.validation.pattern === "phone" && !PHONE.test(value)) {
      return "Enter a phone number using 7 to 30 digits and common separators.";
    }
  }
  return null;
}

export function validateApplication(
  definition: FormDefinition,
  draft: ApplicationDraft,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of getActiveFields(definition, draft.answers)) {
    const value = draft.answers[field.id];
    if (field.validation.required && !hasAnswer(value)) {
      issues.push({
        id: `field-${field.id}-required`,
        code: "required",
        message: `${field.label} is required.`,
        fieldId: field.id,
        sectionId: field.sectionId,
      });
      continue;
    }
    const error = validateFieldValue(field, value);
    if (error) {
      issues.push({
        id: `field-${field.id}-invalid`,
        code: "invalid",
        message: `${field.label}: ${error}`,
        fieldId: field.id,
        sectionId: field.sectionId,
      });
    }
  }

  for (const evidenceRule of definition.evidenceRules) {
    const evidenceId = draft.evidenceMappings[evidenceRule.id];
    const evidence = draft.evidence.find((item) => item.id === evidenceId);
    const acceptedTypes = [...evidenceRule.primaryTypes, ...evidenceRule.alternativeTypes];
    if (!evidence || !acceptedTypes.includes(evidence.type)) {
      issues.push({
        id: `evidence-${evidenceRule.id}-missing`,
        code: "missing-evidence",
        message: `${evidenceRule.title} is still needed.`,
        ruleId: evidenceRule.id,
        sectionId: "evidence",
      });
    }
  }
  return issues;
}
