import { z } from "zod";
import type { FormDefinition } from "./types";

const choice = z.object({ value: z.string().max(80), label: z.string().max(120) }).strict();
const rule: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("equals"), fieldId: z.string(), value: z.unknown() }).strict(),
    z.object({ op: z.literal("includes"), fieldId: z.string(), value: z.unknown() }).strict(),
    z.object({ op: z.literal("exists"), fieldId: z.string() }).strict(),
    z.object({ op: z.literal("and"), rules: z.array(rule).max(10) }).strict(),
    z.object({ op: z.literal("or"), rules: z.array(rule).max(10) }).strict(),
    z.object({ op: z.literal("not"), rule }).strict(),
  ]),
);

export const formDefinitionSchema = z
  .object({
    id: z.string().max(80),
    version: z.number().int().positive(),
    title: z.string().max(120),
    disclaimer: z.string().max(500),
    sections: z
      .array(
        z
          .object({
            id: z.string().max(80),
            title: z.string().max(120),
            plainTitle: z.string().max(120),
            description: z.string().max(400),
            fields: z
              .array(
                z
                  .object({
                    id: z.string().max(80),
                    sectionId: z.string().max(80),
                    kind: z.enum(["text", "textarea", "date", "radio", "checkbox", "select"]),
                    label: z.string().max(180),
                    plainLabel: z.string().max(180),
                    helpText: z.string().max(500).optional(),
                    whyRequested: z.string().max(500).optional(),
                    requiredWhen: rule.optional(),
                    validation: z
                      .object({
                        required: z.boolean().optional(),
                        maxLength: z.number().int().positive().max(2000).optional(),
                        min: z.number().optional(),
                        max: z.number().optional(),
                        pattern: z.enum(["email", "phone", "initials"]).optional(),
                      })
                      .strict(),
                    agentPolicy: z.enum(["read-write", "read-only", "human-only"]),
                    autocomplete: z.string().max(80).optional(),
                    choices: z.array(choice).max(20).optional(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    evidenceRules: z.array(
      z
        .object({
          id: z.string().max(80),
          title: z.string().max(120),
          description: z.string().max(400),
          sourceLabel: z.string().max(120),
          sourceDetail: z.string().max(400),
          primaryTypes: z.array(z.string().max(80)).max(10),
          alternativeTypes: z.array(z.string().max(80)).max(10),
        })
        .strict(),
    ),
  })
  .strict();

const rawDefinition: FormDefinition = {
  id: "harbor-relief-assistance",
  version: 1,
  title: "Harbor Relief Assistance",
  disclaimer:
    "A fictional demonstration program. FormBridge is not affiliated with a government or relief agency and does not determine eligibility or submit applications.",
  sections: [
    {
      id: "contact",
      title: "Contact and communication",
      plainTitle: "How can the program reach you?",
      description: "Share only synthetic demonstration details in this public app.",
      fields: [
        {
          id: "full_name",
          sectionId: "contact",
          kind: "text",
          label: "Applicant name",
          plainLabel: "What name should appear on this demo application?",
          helpText: "Use a fictional name for this demonstration.",
          whyRequested: "The name connects the application pages to the same fictional applicant.",
          validation: { required: true, maxLength: 100 },
          agentPolicy: "read-write",
          autocomplete: "name",
        },
        {
          id: "preferred_contact",
          sectionId: "contact",
          kind: "radio",
          label: "Preferred contact method",
          plainLabel: "How should the program contact you?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: [
            { value: "email", label: "Email" },
            { value: "phone", label: "Phone" },
          ],
        },
        {
          id: "email",
          sectionId: "contact",
          kind: "text",
          label: "Email address",
          plainLabel: "What fictional email address should we use?",
          requiredWhen: { op: "equals", fieldId: "preferred_contact", value: "email" },
          validation: { required: true, maxLength: 160, pattern: "email" },
          agentPolicy: "read-write",
          autocomplete: "email",
        },
        {
          id: "phone",
          sectionId: "contact",
          kind: "text",
          label: "Phone number",
          plainLabel: "What fictional phone number should we use?",
          requiredWhen: { op: "equals", fieldId: "preferred_contact", value: "phone" },
          validation: { required: true, maxLength: 30, pattern: "phone" },
          agentPolicy: "read-write",
          autocomplete: "tel",
        },
        {
          id: "safe_contact_time",
          sectionId: "contact",
          kind: "select",
          label: "Safest time to make contact",
          plainLabel: "When is it safest to contact you?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: [
            { value: "morning", label: "Morning" },
            { value: "afternoon", label: "Afternoon" },
            { value: "evening", label: "Evening" },
          ],
        },
        {
          id: "consent_to_contact",
          sectionId: "contact",
          kind: "checkbox",
          label: "I agree that the fictional program may contact me using these demo details.",
          plainLabel: "Do you agree to be contacted? Only you can answer this.",
          validation: { required: true },
          agentPolicy: "human-only",
        },
      ],
    },
    {
      id: "household",
      title: "Household",
      plainTitle: "Who is staying with you?",
      description: "Counts help demonstrate how a relief program might understand household needs.",
      fields: [
        {
          id: "adult_count",
          sectionId: "household",
          kind: "select",
          label: "Adults in household",
          plainLabel: "How many adults are in your household?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: ["1", "2", "3", "4", "5+"].map((value) => ({ value, label: value })),
        },
        {
          id: "child_count",
          sectionId: "household",
          kind: "select",
          label: "Children in household",
          plainLabel: "How many children are in your household?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: ["0", "1", "2", "3", "4+"].map((value) => ({ value, label: value })),
        },
        {
          id: "access_needs",
          sectionId: "household",
          kind: "textarea",
          label: "Access or accommodation needs",
          plainLabel: "Does anyone need accessibility support?",
          helpText: "Optional. Describe practical support, not medical diagnoses.",
          validation: { maxLength: 500 },
          agentPolicy: "read-write",
        },
      ],
    },
    {
      id: "displacement",
      title: "Current displacement",
      plainTitle: "Can you stay at home right now?",
      description: "This fictional program asks where the household can safely stay.",
      fields: [
        {
          id: "currently_displaced",
          sectionId: "displacement",
          kind: "radio",
          label: "Currently displaced from home",
          plainLabel: "Are you unable to stay at home right now?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        },
        {
          id: "current_shelter",
          sectionId: "displacement",
          kind: "text",
          label: "Current safe place",
          plainLabel: "Where are you staying now?",
          requiredWhen: { op: "equals", fieldId: "currently_displaced", value: "yes" },
          validation: { required: true, maxLength: 180 },
          agentPolicy: "read-write",
        },
        {
          id: "safe_return",
          sectionId: "displacement",
          kind: "radio",
          label: "Safe to return within seven days",
          plainLabel: "Do you expect it to be safe to return home within seven days?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
      ],
    },
    {
      id: "impact",
      title: "Property impact",
      plainTitle: "What happened to the home?",
      description: "Describe the fictional event and its visible effect.",
      fields: [
        {
          id: "home_impact",
          sectionId: "impact",
          kind: "select",
          label: "Level of property impact",
          plainLabel: "How badly was the home affected?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: [
            { value: "minor", label: "Minor damage" },
            { value: "major", label: "Major damage" },
            { value: "destroyed", label: "Destroyed" },
            { value: "unknown", label: "Not yet known" },
          ],
        },
        {
          id: "damage_summary",
          sectionId: "impact",
          kind: "textarea",
          label: "Damage summary",
          plainLabel: "In a few words, what was damaged?",
          helpText: "Keep this factual and under 800 characters.",
          validation: { required: true, maxLength: 800 },
          agentPolicy: "read-write",
        },
      ],
    },
    {
      id: "needs",
      title: "Immediate needs",
      plainTitle: "What help is needed first?",
      description: "Choose all immediate needs that apply to the fictional household.",
      fields: [
        {
          id: "urgent_needs",
          sectionId: "needs",
          kind: "checkbox",
          label: "Immediate assistance needed",
          plainLabel: "What does the household need right away?",
          validation: { required: true },
          agentPolicy: "read-write",
          choices: [
            { value: "temporary-housing", label: "Temporary housing" },
            { value: "food", label: "Food" },
            { value: "clothing", label: "Clothing" },
            { value: "transport", label: "Transportation" },
            { value: "other", label: "Something else" },
          ],
        },
        {
          id: "other_need",
          sectionId: "needs",
          kind: "text",
          label: "Other immediate need",
          plainLabel: "What other help is needed?",
          requiredWhen: { op: "includes", fieldId: "urgent_needs", value: "other" },
          validation: { required: true, maxLength: 200 },
          agentPolicy: "read-write",
        },
      ],
    },
  ],
  evidenceRules: [
    {
      id: "proof_identity",
      title: "Identity document",
      description: "One document showing the fictional applicant's name.",
      sourceLabel: "Harbor Relief demo guide, section 2A",
      sourceDetail: "Accepted demo evidence includes a photo ID or temporary identity letter.",
      primaryTypes: ["photo-id"],
      alternativeTypes: ["temporary-identity-letter"],
    },
    {
      id: "proof_occupancy",
      title: "Proof the applicant occupied the home",
      description: "A standard document or an accepted alternative connecting the applicant to the home.",
      sourceLabel: "Harbor Relief demo guide, section 2B",
      sourceDetail: "If a lease or utility bill is unavailable, a shelter or landlord statement is accepted.",
      primaryTypes: ["lease", "utility-bill"],
      alternativeTypes: ["shelter-statement", "landlord-statement"],
    },
    {
      id: "damage_documentation",
      title: "Damage documentation",
      description: "A fictional image or report describing property impact.",
      sourceLabel: "Harbor Relief demo guide, section 2C",
      sourceDetail: "A damage photo or insurance report satisfies this demo requirement.",
      primaryTypes: ["damage-photo"],
      alternativeTypes: ["insurance-report"],
    },
  ],
};

export const harborReliefDefinition = formDefinitionSchema.parse(rawDefinition) as FormDefinition;

const allIds = [
  ...harborReliefDefinition.sections.map((section) => section.id),
  ...harborReliefDefinition.sections.flatMap((section) => section.fields.map((field) => field.id)),
  ...harborReliefDefinition.evidenceRules.map((evidenceRule) => evidenceRule.id),
];
if (new Set(allIds).size !== allIds.length) {
  throw new Error("Harbor Relief definition contains duplicate identifiers.");
}

