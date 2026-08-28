import type { FieldDefinition, FormDefinition, RuleExpression } from "./types";

export function evaluateRule(
  rule: RuleExpression,
  answers: Record<string, unknown>,
): boolean {
  switch (rule.op) {
    case "equals":
      return answers[rule.fieldId] === rule.value;
    case "includes": {
      const value = answers[rule.fieldId];
      return Array.isArray(value) && value.includes(rule.value);
    }
    case "exists": {
      const value = answers[rule.fieldId];
      return value !== undefined && value !== null && value !== "";
    }
    case "and":
      return rule.rules.every((child) => evaluateRule(child, answers));
    case "or":
      return rule.rules.some((child) => evaluateRule(child, answers));
    case "not":
      return !evaluateRule(rule.rule, answers);
  }
}

export function isFieldActive(
  field: FieldDefinition,
  answers: Record<string, unknown>,
): boolean {
  return field.requiredWhen ? evaluateRule(field.requiredWhen, answers) : true;
}

export function getField(
  definition: FormDefinition,
  fieldId: string,
): FieldDefinition | undefined {
  for (const section of definition.sections) {
    const field = section.fields.find((candidate) => candidate.id === fieldId);
    if (field) return field;
  }
  return undefined;
}

export function getActiveFields(
  definition: FormDefinition,
  answers: Record<string, unknown>,
): FieldDefinition[] {
  return definition.sections.flatMap((section) =>
    section.fields.filter((field) => isFieldActive(field, answers)),
  );
}

export function hasAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  return false;
}
