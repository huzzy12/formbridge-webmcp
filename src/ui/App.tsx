import {
  Component,
  type ErrorInfo,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApplicationService } from "../application/application-service";
import {
  getApplicationStatus,
  validateApplication,
} from "../domain/engine";
import { harborReliefDefinition } from "../domain/harbor-relief";
import { getActiveFields } from "../domain/rules";
import type {
  ApplicationCommand,
  ApplicationWorkspace,
  FieldDefinition,
  ValidationIssue,
} from "../domain/types";
import { IndexedDbDraftRepository } from "../persistence/repository";
import { registerFormBridgeTools } from "../webmcp/adapter";
import type { AgentActivity } from "../webmcp/types";

type Screen = "welcome" | "application" | "review" | "complete";
type Mode = "standard" | "plain";

const definition = harborReliefDefinition;
const EVIDENCE_INDEX = definition.sections.length;

function Icon({ name }: { name: "bridge" | "lock" | "agent" | "check" | "warning" }) {
  const paths = {
    bridge: <><path d="M3 16h18M5 16V9m14 7V9M7 9h10M9 9V6h6v3M7 20v-4m10 4v-4"/><path d="M3 12c3-4 6-4 9 0 3-4 6-4 9 0"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2"/></>,
    agent: <><path d="M12 3v3m-7 6H2m20 0h-3"/><rect x="5" y="6" width="14" height="13" rx="4"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M9 16h6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    warning: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

class FormBridgeErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  override state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FormBridge recovered from a rendering error.", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="recovery-page">
        <div className="recovery-card">
          <Icon name="warning" />
          <p className="eyebrow">Your saved draft is still local</p>
          <h1>FormBridge needs a fresh page</h1>
          <p>A screen could not be displayed. Your last successfully saved change remains in this browser.</p>
          <button className="button primary" onClick={() => window.location.reload()}>Reload FormBridge</button>
        </div>
      </main>
    );
  }
}

interface FieldControlProps {
  field: FieldDefinition;
  value: unknown;
  issue?: ValidationIssue;
  agentUpdated: boolean;
  plain?: boolean;
  onCommit: (fieldId: string, value: unknown) => Promise<void>;
}

function FieldControl({ field, value, issue, agentUpdated, plain, onCommit }: FieldControlProps) {
  const stringValue = typeof value === "string" ? value : "";
  const [localValue, setLocalValue] = useState(stringValue);
  useEffect(() => setLocalValue(stringValue), [stringValue]);
  const label = plain ? field.plainLabel : field.label;
  const describedBy = [field.helpText ? `${field.id}-help` : "", issue ? `${field.id}-error` : ""]
    .filter(Boolean)
    .join(" ") || undefined;
  const frameClass = `field-frame${issue ? " has-error" : ""}${agentUpdated ? " agent-updated" : ""}`;

  if (field.kind === "radio") {
    return (
      <fieldset id={`field-${field.id}`} className={frameClass} aria-describedby={describedBy}>
        <legend>{label}{field.validation.required && <span className="required"> required</span>}</legend>
        {field.helpText && <p id={`${field.id}-help`} className="help">{field.helpText}</p>}
        <div className="choice-stack">
          {field.choices?.map((choice) => (
            <label className="choice" key={choice.value}>
              <input
                type="radio"
                name={field.id}
                value={choice.value}
                checked={value === choice.value}
                onChange={() => void onCommit(field.id, choice.value)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
        {issue && <p id={`${field.id}-error`} className="field-error"><Icon name="warning" />{issue.message}</p>}
        {agentUpdated && <span className="agent-mark"><Icon name="agent" /> Updated by agent</span>}
      </fieldset>
    );
  }

  if (field.kind === "checkbox" && field.choices) {
    const selected = Array.isArray(value)
      ? value.filter((entry: unknown): entry is string => typeof entry === "string")
      : [];
    return (
      <fieldset id={`field-${field.id}`} className={frameClass} aria-describedby={describedBy}>
        <legend>{label}<span className="required"> required</span></legend>
        <div className="choice-stack">
          {field.choices.map((choice) => (
            <label className="choice" key={choice.value}>
              <input
                type="checkbox"
                checked={selected.includes(choice.value)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, choice.value]
                    : selected.filter((entry) => entry !== choice.value);
                  void onCommit(field.id, next);
                }}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
        {issue && <p id={`${field.id}-error`} className="field-error"><Icon name="warning" />{issue.message}</p>}
        {agentUpdated && <span className="agent-mark"><Icon name="agent" /> Updated by agent</span>}
      </fieldset>
    );
  }

  if (field.kind === "checkbox") {
    return (
      <div id={`field-${field.id}`} className={frameClass}>
        <label className="choice human-choice">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => void onCommit(field.id, event.target.checked)}
            aria-describedby={describedBy}
          />
          <span>{label}</span>
        </label>
        {field.agentPolicy === "human-only" && <p className="human-only"><Icon name="lock" /> Human only — an agent cannot answer this.</p>}
        {issue && <p id={`${field.id}-error`} className="field-error"><Icon name="warning" />{issue.message}</p>}
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <div id={`field-${field.id}`} className={frameClass}>
        <label htmlFor={field.id}>{label}<span className="required"> required</span></label>
        <select
          id={field.id}
          value={stringValue}
          onChange={(event) => void onCommit(field.id, event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={Boolean(issue)}
        >
          <option value="">Choose an option</option>
          {field.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
        {field.helpText && <p id={`${field.id}-help`} className="help">{field.helpText}</p>}
        {issue && <p id={`${field.id}-error`} className="field-error"><Icon name="warning" />{issue.message}</p>}
        {agentUpdated && <span className="agent-mark"><Icon name="agent" /> Updated by agent</span>}
      </div>
    );
  }

  const InputTag = field.kind === "textarea" ? "textarea" : "input";
  return (
    <div id={`field-${field.id}`} className={frameClass}>
      <label htmlFor={field.id}>{label}{field.validation.required && <span className="required"> required</span>}</label>
      <InputTag
        id={field.id}
        {...(field.kind === "textarea" ? { rows: 5 } : { type: field.kind === "date" ? "date" : "text" })}
        value={localValue}
        maxLength={field.validation.maxLength}
        autoComplete={field.autocomplete}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => {
          if (localValue !== stringValue) void onCommit(field.id, localValue);
        }}
        aria-describedby={describedBy}
        aria-invalid={Boolean(issue)}
      />
      {field.helpText && <p id={`${field.id}-help`} className="help">{field.helpText}</p>}
      {field.validation.maxLength && <p className="character-count" aria-live="off">{localValue.length} / {field.validation.maxLength}</p>}
      {issue && <p id={`${field.id}-error`} className="field-error"><Icon name="warning" />{issue.message}</p>}
      {agentUpdated && <span className="agent-mark"><Icon name="agent" /> Updated by agent</span>}
    </div>
  );
}

function StatusPill({ state }: { state: "done" | "current" | "todo" }) {
  return <span className={`status-dot ${state}`} aria-hidden="true">{state === "done" ? "✓" : ""}</span>;
}

function EvidencePanel({
  workspace,
  issues,
  onSelect,
}: {
  workspace: ApplicationWorkspace;
  issues: ValidationIssue[];
  onSelect: (ruleId: string, evidenceId: string) => Promise<void>;
}) {
  return (
    <section aria-labelledby="evidence-title">
      <p className="eyebrow">Step 6 of 6</p>
      <h1 id="evidence-title">Supporting evidence</h1>
      <p className="lede">Connect an existing synthetic document to each requirement. No files leave this browser.</p>
      <div className="evidence-list">
        {definition.evidenceRules.map((rule) => {
          const selectedId = workspace.draft.evidenceMappings[rule.id] ?? "";
          const selected = workspace.draft.evidence.find((item) => item.id === selectedId);
          const compatible = workspace.draft.evidence.filter((item) =>
            [...rule.primaryTypes, ...rule.alternativeTypes].includes(item.type),
          );
          const resolved = Boolean(selected);
          const isAlternative = selected ? rule.alternativeTypes.includes(selected.type) : false;
          const issue = issues.find((candidate) => candidate.ruleId === rule.id);
          return (
            <article className={`evidence-card ${resolved ? "resolved" : ""}`} key={rule.id} id={`evidence-${rule.id}`}>
              <div className="evidence-heading">
                <StatusPill state={resolved ? "done" : "todo"} />
                <div>
                  <h2>{rule.title}</h2>
                  <p>{rule.description}</p>
                </div>
              </div>
              <label htmlFor={`select-${rule.id}`}>Evidence to use</label>
              <select
                id={`select-${rule.id}`}
                value={selectedId}
                onChange={(event) => void onSelect(rule.id, event.target.value)}
                aria-invalid={Boolean(issue)}
                aria-describedby={issue ? `evidence-error-${rule.id}` : undefined}
              >
                <option value="">Choose synthetic evidence</option>
                {compatible.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
              {isAlternative && <p className="alternative-note"><Icon name="check" /> Accepted alternative — no standard lease or utility bill is needed.</p>}
              {issue && <p id={`evidence-error-${rule.id}`} className="field-error"><Icon name="warning" />{issue.message}</p>}
              <details>
                <summary>Why this is accepted</summary>
                <p>{rule.sourceDetail}</p>
                <p className="source-label">Source: {rule.sourceLabel}</p>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ErrorSummary({ issues, onIssue }: { issues: ValidationIssue[]; onIssue: (issue: ValidationIssue) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [issues]);
  if (issues.length === 0) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <h2><Icon name="warning" /> {issues.length} {issues.length === 1 ? "item needs" : "items need"} attention</h2>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id}><button className="text-button" onClick={() => onIssue(issue)}>{issue.message}</button></li>
        ))}
      </ul>
    </div>
  );
}

function Welcome({ resumeAvailable, onStart, onResume }: { resumeAvailable: boolean; onStart: (guided: boolean) => void; onResume: () => void }) {
  return (
    <main id="main-content" className="welcome-shell">
      <section className="welcome-hero">
        <div className="hero-copy">
          <p className="eyebrow">A safer way through difficult forms</p>
          <h1>Relief paperwork,<br /><span>made understandable.</span></h1>
          <p className="hero-lede">Complete a fictional emergency-aid application yourself, or let a browser agent help with only the fields you permit.</p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => onStart(true)}>Try the guided demo <span aria-hidden="true">→</span></button>
            <button className="button secondary" onClick={() => onStart(false)}>Start blank</button>
          </div>
          {resumeAvailable && <button className="resume-link" onClick={onResume}>Resume the draft saved in this browser →</button>}
        </div>
        <div className="trust-panel" aria-label="What FormBridge protects">
          <div className="trust-icon"><Icon name="bridge" /></div>
          <p className="trust-kicker">Before you begin</p>
          <h2>You remain in control</h2>
          <ul className="trust-list">
            <li><Icon name="lock" /><span><strong>Stays on this device</strong>Your draft is stored only in this browser.</span></li>
            <li><Icon name="agent" /><span><strong>Agents have boundaries</strong>They cannot consent, attest, or finalize.</span></li>
            <li><Icon name="check" /><span><strong>Rules are visible</strong>Every evidence decision shows its fictional source.</span></li>
          </ul>
        </div>
      </section>
      <section className="demo-boundary" aria-labelledby="demo-boundary-title">
        <div><span className="fictional-badge">Fictional demonstration</span></div>
        <div>
          <h2 id="demo-boundary-title">Harbor Relief Assistance is not a real program</h2>
          <p>Use only the synthetic details provided. FormBridge does not determine eligibility, send data to an agency, or claim that anything has been submitted.</p>
        </div>
      </section>
    </main>
  );
}

function formatAnswer(field: FieldDefinition, value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => field.choices?.find((choice) => choice.value === entry)?.label ?? String(entry)).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    return field.choices?.find((choice) => choice.value === value)?.label ?? (value || "Not answered");
  }
  if (typeof value === "number") return String(value);
  return "Not answered";
}

function Review({
  workspace,
  onCorrect,
  onComplete,
}: {
  workspace: ApplicationWorkspace;
  onCorrect: (fieldId?: string) => void;
  onComplete: (confirmed: boolean, initials: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const active = getActiveFields(definition, workspace.draft.answers);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    await onComplete(confirmed, initials);
    setBusy(false);
  };
  return (
    <main id="main-content" className="review-page">
      <div className="review-intro">
        <p className="eyebrow">Human review</p>
        <h1>Read it once. Change anything.</h1>
        <p className="lede">An agent may have helped prepare this draft, but only you can confirm it. Nothing is sent anywhere.</p>
      </div>
      <div className="review-layout">
        <div className="review-content">
          {definition.sections.map((section) => {
            const fields = active.filter((field) => field.sectionId === section.id);
            return (
              <section className="review-section" key={section.id} aria-labelledby={`review-${section.id}`}>
                <div className="review-section-heading">
                  <h2 id={`review-${section.id}`}>{section.title}</h2>
                  <button className="text-button" onClick={() => onCorrect(fields[0]?.id)}>Edit section</button>
                </div>
                <dl>
                  {fields.map((field) => (
                    <div key={field.id}><dt>{field.label}</dt><dd>{formatAnswer(field, workspace.draft.answers[field.id])}</dd></div>
                  ))}
                </dl>
              </section>
            );
          })}
          <section className="review-section" aria-labelledby="review-evidence">
            <div className="review-section-heading">
              <h2 id="review-evidence">Supporting evidence</h2>
              <button className="text-button" onClick={() => onCorrect()}>Edit evidence</button>
            </div>
            <dl>
              {definition.evidenceRules.map((rule) => {
                const item = workspace.draft.evidence.find((candidate) => candidate.id === workspace.draft.evidenceMappings[rule.id]);
                return <div key={rule.id}><dt>{rule.title}</dt><dd>{item?.title ?? "Not mapped"}</dd></div>;
              })}
            </dl>
          </section>
        </div>
        <aside className="attestation-card">
          <Icon name="lock" />
          <p className="eyebrow">Reserved for you</p>
          <h2>Final attestation</h2>
          <p>I reviewed the fictional application and confirm that its synthetic information is complete for this demonstration.</p>
          <form onSubmit={(event) => void submit(event)}>
            <label className="choice human-choice">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>I confirm this statement.</span>
            </label>
            <label htmlFor="attestation-initials">Your initials</label>
            <input
              id="attestation-initials"
              value={initials}
              onChange={(event) => setInitials(event.target.value.replace(/[^a-z]/gi, "").slice(0, 4))}
              autoComplete="off"
              inputMode="text"
              maxLength={4}
              aria-describedby="initials-help"
            />
            <p id="initials-help" className="help">Enter 2–4 letters. An agent cannot do this.</p>
            <button className="button primary full" disabled={!confirmed || initials.length < 2 || busy}>
              {busy ? "Preparing…" : "Prepare packet locally"}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}

function Packet({ workspace, onBack }: { workspace: ApplicationWorkspace; onBack: () => void }) {
  const active = getActiveFields(definition, workspace.draft.answers);
  return (
    <main id="main-content" className="packet-page">
      <section className="completion-card no-print">
        <div className="completion-icon"><Icon name="check" /></div>
        <p className="eyebrow">Complete on this device</p>
        <h1>Packet prepared locally.</h1>
        <p>Nothing was submitted. Use your browser’s print dialog to print or choose “Save as PDF.”</p>
        <div className="hero-actions">
          <button className="button primary" onClick={() => window.print()}>Print or save as PDF</button>
          <button className="button secondary" onClick={onBack}>Review again</button>
        </div>
      </section>
      <article className="print-packet" aria-label="Prepared application packet">
        <header>
          <div className="brand-mark"><Icon name="bridge" /><span>FormBridge</span></div>
          <p>Prepared locally · Fictional demonstration</p>
          <h1>{definition.title}</h1>
          <p>{definition.disclaimer}</p>
        </header>
        {definition.sections.map((section) => (
          <section key={section.id}>
            <h2>{section.title}</h2>
            <dl>
              {active.filter((field) => field.sectionId === section.id).map((field) => (
                <div key={field.id}><dt>{field.label}</dt><dd>{formatAnswer(field, workspace.draft.answers[field.id])}</dd></div>
              ))}
            </dl>
          </section>
        ))}
        <section>
          <h2>Evidence mapping</h2>
          <dl>
            {definition.evidenceRules.map((rule) => {
              const item = workspace.draft.evidence.find((candidate) => candidate.id === workspace.draft.evidenceMappings[rule.id]);
              return <div key={rule.id}><dt>{rule.title}</dt><dd>{item?.title} · {rule.sourceLabel}</dd></div>;
            })}
          </dl>
        </section>
        <footer>
          <p>Human attestation: {workspace.draft.attestation?.initials} · {workspace.draft.attestation ? new Date(workspace.draft.attestation.attestedAt).toLocaleString() : "Not attested"}</p>
          <p>Draft revision {workspace.draft.revision}. This packet was prepared locally and was not submitted.</p>
        </footer>
      </article>
    </main>
  );
}

function AppHeader({ screen, onHome, onClear }: { screen: Screen; onHome: () => void; onClear: () => void }) {
  return (
    <header className="app-header no-print">
      <button className="brand-button" onClick={onHome} aria-label="FormBridge home">
        <span className="brand-mark"><Icon name="bridge" /></span>
        <span>FormBridge</span>
      </button>
      <div className="header-meta">
        <span className="fictional-badge">Fictional demo</span>
        {screen !== "welcome" && <button className="quiet-button" onClick={onClear}>Clear local draft</button>}
      </div>
    </header>
  );
}

function ApplicationRail({
  workspace,
  sectionIndex,
  onNavigate,
  agentAvailable,
  activities,
  guided,
  onUndo,
}: {
  workspace: ApplicationWorkspace;
  sectionIndex: number;
  onNavigate: (index: number) => void;
  agentAvailable: boolean;
  activities: AgentActivity[];
  guided: boolean;
  onUndo: () => void;
}) {
  const issues = validateApplication(definition, workspace.draft);
  return (
    <aside className="application-rail no-print" aria-label="Application progress and agent activity">
      <nav aria-label="Application sections">
        <p className="rail-label">Application</p>
        <ol className="section-nav">
          {[...definition.sections.map((section) => ({ id: section.id, title: section.title })), { id: "evidence", title: "Supporting evidence" }].map((item, index) => {
            const hasIssue = issues.some((issue) => issue.sectionId === item.id);
            const state = index === sectionIndex ? "current" : index < sectionIndex && !hasIssue ? "done" : "todo";
            return (
              <li key={item.id}>
                <button aria-current={index === sectionIndex ? "step" : undefined} onClick={() => onNavigate(index)}>
                  <StatusPill state={state} /><span>{item.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="rail-divider" />
      <section className="agent-status" aria-labelledby="agent-status-title">
        <div className="agent-status-heading">
          <span className={`availability ${agentAvailable ? "online" : "manual"}`} aria-hidden="true" />
          <h2 id="agent-status-title">{agentAvailable ? "Agent tools available" : "Manual mode ready"}</h2>
        </div>
        <p>{agentAvailable ? "A compatible browser agent can help with permitted fields." : "This browser has no WebMCP connection. Every feature still works manually."}</p>
        {guided && (
          <details className="demo-profile">
            <summary>Synthetic profile for the demo</summary>
            <p><strong>Jordan Lee</strong> · jordan.lee@example.test · afternoons</p>
            <p>2 adults, 1 child · displaced at Harbor High School · major flood damage · housing and food needed.</p>
          </details>
        )}
        <details className="activity-drawer">
          <summary>Recent agent activity <span>{activities.length}</span></summary>
          {activities.length === 0 ? <p>No agent actions yet.</p> : (
            <ol>{activities.slice(0, 6).map((item) => <li key={item.id}><span className={`activity-state ${item.status}`} /> <span>{item.summary}<small>{new Date(item.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span></li>)}</ol>
          )}
        </details>
        <button className="button secondary compact" onClick={onUndo} disabled={workspace.undoStack.length === 0}>Undo latest agent change</button>
      </section>
    </aside>
  );
}

function App() {
  const repository = useMemo(() => new IndexedDbDraftRepository(), []);
  const service = useMemo(() => new ApplicationService(definition, repository), [repository]);
  const [workspace, setWorkspace] = useState(service.getSnapshot());
  const [screen, setScreen] = useState<Screen>("welcome");
  const [mode, setMode] = useState<Mode>("standard");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [plainIndex, setPlainIndex] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [guided, setGuided] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [agentUpdatedFields, setAgentUpdatedFields] = useState<Set<string>>(new Set());
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => service.subscribe((next) => setWorkspace(next)), [service]);
  useEffect(() => {
    void service.initialize().then(({ resumed, workspace: loaded }) => {
      setWorkspace(loaded);
      setResumeAvailable(resumed);
      setInitialized(true);
    });
  }, [service]);
  useEffect(() => {
    const registration = registerFormBridgeTools(document.modelContext, definition, service, (item) => {
      setActivities((current) => [item, ...current].slice(0, 20));
      setAnnouncement(item.summary);
      if (item.toolName === "set_answer" && item.status === "succeeded") {
        const latest = service.getSnapshot().auditEvents.at(-1);
        if (latest?.actor === "agent") {
          setAgentUpdatedFields((current) => new Set([...current, ...latest.entityIds]));
        }
      }
    });
    setAgentAvailable(registration.available);
    return registration.unregister;
  }, [service]);

  const activeFields = getActiveFields(definition, workspace.draft.answers);
  const issues = validateApplication(definition, workspace.draft);
  const status = getApplicationStatus(definition, workspace.draft);

  const humanCommand = useCallback(async (command: ApplicationCommand) => {
    try {
      const result = await service.dispatch({
        requestId: crypto.randomUUID(),
        expectedRevision: service.getSnapshot().draft.revision,
        actor: "human",
        command,
      });
      if (!result.ok) setAnnouncement(result.nextAction);
    } catch {
      setAnnouncement("That change could not be saved locally. Your previous saved draft is unchanged.");
    }
  }, [service]);

  const commitAnswer = useCallback(async (fieldId: string, value: unknown) => {
    await humanCommand({ type: "set-answer", fieldId, value });
  }, [humanCommand]);

  const focusTarget = (selector: string) => {
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
  };

  const navigateToIssue = (issue: ValidationIssue) => {
    setScreen("application");
    setShowErrors(true);
    if (issue.fieldId) {
      const index = definition.sections.findIndex((section) => section.id === issue.sectionId);
      setSectionIndex(Math.max(0, index));
      setMode("standard");
      focusTarget(`#${issue.fieldId}, #field-${issue.fieldId} input, #field-${issue.fieldId} textarea, #field-${issue.fieldId} select`);
    } else {
      setSectionIndex(EVIDENCE_INDEX);
      setMode("standard");
      focusTarget(`#evidence-${issue.ruleId} select`);
    }
  };

  const start = async (useGuide: boolean) => {
    await service.startBlank();
    setGuided(useGuide);
    setSectionIndex(0);
    setPlainIndex(0);
    setShowErrors(false);
    setScreen("application");
    setAnnouncement(useGuide ? "Guided demo ready. Synthetic evidence is already on this device." : "Blank application started.");
    focusTarget("#main-content h1");
  };

  const clearData = async () => {
    const confirmed = window.confirm("Clear this local draft and its audit history from this browser? This cannot be undone.");
    if (!confirmed) return;
    const cleared = await service.clear();
    if (cleared) {
      setScreen("welcome");
      setResumeAvailable(false);
      setActivities([]);
      setAnnouncement("Local draft cleared and deletion verified.");
    }
  };

  const nextStandard = () => {
    const currentIssuesSnapshot = validateApplication(definition, service.getSnapshot().draft);
    const currentId = sectionIndex === EVIDENCE_INDEX ? "evidence" : definition.sections[sectionIndex]?.id;
    const currentIssues = currentIssuesSnapshot.filter((issue) => issue.sectionId === currentId);
    if (currentIssues.length > 0) {
      setShowErrors(true);
      focusTarget(".error-summary");
      return;
    }
    if (sectionIndex < EVIDENCE_INDEX) {
      setSectionIndex((value) => value + 1);
      setShowErrors(false);
      focusTarget("#main-content h1");
    } else if (currentIssuesSnapshot.length === 0) {
      setScreen("review");
      focusTarget("#main-content h1");
    }
  };

  const changeMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    if (nextMode === "plain") {
      const firstInSection = activeFields.findIndex((field) => field.sectionId === definition.sections[sectionIndex]?.id);
      setPlainIndex(firstInSection >= 0 ? firstInSection : 0);
    } else {
      const current = activeFields[plainIndex];
      const nextSection = current ? definition.sections.findIndex((section) => section.id === current.sectionId) : EVIDENCE_INDEX;
      setSectionIndex(nextSection >= 0 ? nextSection : 0);
    }
    setMode(nextMode);
    focusTarget("#main-content h1");
  };

  const correctFromReview = (fieldId?: string) => {
    setScreen("application");
    setMode("standard");
    if (fieldId) {
      const field = activeFields.find((candidate) => candidate.id === fieldId);
      setSectionIndex(definition.sections.findIndex((section) => section.id === field?.sectionId));
      focusTarget(`#${fieldId}, #field-${fieldId} input`);
    } else {
      setSectionIndex(EVIDENCE_INDEX);
      focusTarget("#evidence-title");
    }
  };

  const complete = async (confirmed: boolean, initials: string) => {
    const previousRevision = service.getSnapshot().draft.revision;
    await humanCommand({ type: "attest-and-complete", confirmed, initials });
    if (service.getSnapshot().draft.revision > previousRevision && service.getSnapshot().draft.status === "completed") {
      setScreen("complete");
      setAnnouncement("Packet prepared locally. Nothing was submitted.");
      focusTarget("#main-content h1");
    }
  };

  if (!initialized) {
    return <main className="loading-screen" aria-busy="true"><div className="brand-mark"><Icon name="bridge" /></div><p>Opening your local workspace…</p></main>;
  }

  const currentField = activeFields[plainIndex];
  const plainAtEvidence = plainIndex >= activeFields.length;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="live-region" aria-live="polite" aria-atomic="true">{announcement}</div>
      <AppHeader screen={screen} onHome={() => setScreen("welcome")} onClear={() => void clearData()} />
      {screen === "welcome" && <Welcome resumeAvailable={resumeAvailable} onStart={(value) => void start(value)} onResume={() => setScreen(workspace.draft.status === "completed" ? "complete" : "application")} />}
      {screen === "review" && <Review workspace={workspace} onCorrect={correctFromReview} onComplete={complete} />}
      {screen === "complete" && <Packet workspace={workspace} onBack={() => setScreen("review")} />}
      {screen === "application" && (
        <div className="application-shell">
          <ApplicationRail
            workspace={workspace}
            sectionIndex={mode === "plain" && currentField ? definition.sections.findIndex((section) => section.id === currentField.sectionId) : sectionIndex}
            onNavigate={(index) => { setMode("standard"); setSectionIndex(index); setShowErrors(false); focusTarget("#main-content h1"); }}
            agentAvailable={agentAvailable}
            activities={activities}
            guided={guided}
            onUndo={() => void humanCommand({ type: "undo-last-agent-change" })}
          />
          <main id="main-content" className="form-main" ref={mainRef}>
            <div className="form-toolbar no-print">
              <div>
                <span className="progress-label">{status.progressPercent}% of active questions answered</span>
                <progress className="progress-track" aria-label="Application progress" max={100} value={status.progressPercent}>{status.progressPercent}%</progress>
              </div>
              <div className="mode-switch" aria-label="Question layout">
                <button aria-pressed={mode === "standard"} onClick={() => changeMode("standard")}>Standard</button>
                <button aria-pressed={mode === "plain"} onClick={() => changeMode("plain")}>One at a time</button>
              </div>
            </div>
            {showErrors && <ErrorSummary issues={issues} onIssue={navigateToIssue} />}
            {mode === "standard" && sectionIndex < EVIDENCE_INDEX && (() => {
              const section = definition.sections[sectionIndex];
              if (!section) return null;
              const fields = activeFields.filter((field) => field.sectionId === section.id);
              return (
                <section aria-labelledby={`section-${section.id}`}>
                  <p className="eyebrow">Step {sectionIndex + 1} of {EVIDENCE_INDEX + 1}</p>
                  <h1 id={`section-${section.id}`} tabIndex={-1}>{section.title}</h1>
                  <p className="lede">{section.description}</p>
                  <div className="fields">
                    {fields.map((field) => <FieldControl key={field.id} field={field} value={workspace.draft.answers[field.id]} issue={showErrors ? issues.find((issue) => issue.fieldId === field.id) : undefined} agentUpdated={agentUpdatedFields.has(field.id)} onCommit={commitAnswer} />)}
                  </div>
                </section>
              );
            })()}
            {mode === "standard" && sectionIndex === EVIDENCE_INDEX && <EvidencePanel workspace={workspace} issues={showErrors ? issues : []} onSelect={async (ruleId, evidenceId) => humanCommand({ type: "select-evidence", ruleId, evidenceId })} />}
            {mode === "plain" && !plainAtEvidence && currentField && (
              <section className="plain-question" aria-labelledby={`plain-${currentField.id}`}>
                <p className="eyebrow">Question {plainIndex + 1} of {activeFields.length}</p>
                <h1 id={`plain-${currentField.id}`} tabIndex={-1}>{currentField.plainLabel}</h1>
                <p className="plain-context">{definition.sections.find((section) => section.id === currentField.sectionId)?.description}</p>
                <FieldControl field={{ ...currentField, plainLabel: "Your answer", label: "Your answer" }} value={workspace.draft.answers[currentField.id]} issue={showErrors ? issues.find((issue) => issue.fieldId === currentField.id) : undefined} agentUpdated={agentUpdatedFields.has(currentField.id)} plain onCommit={commitAnswer} />
              </section>
            )}
            {mode === "plain" && plainAtEvidence && <EvidencePanel workspace={workspace} issues={showErrors ? issues : []} onSelect={async (ruleId, evidenceId) => humanCommand({ type: "select-evidence", ruleId, evidenceId })} />}
            <div className="form-actions no-print">
              <button className="button secondary" disabled={mode === "standard" ? sectionIndex === 0 : plainIndex === 0} onClick={() => { setShowErrors(false); if (mode === "standard") setSectionIndex((value) => Math.max(0, value - 1)); else setPlainIndex((value) => Math.max(0, value - 1)); focusTarget("#main-content h1"); }}>← Back</button>
              {mode === "standard" ? (
                <button className="button primary" onClick={nextStandard}>{sectionIndex === EVIDENCE_INDEX ? "Review application" : "Save and continue"} →</button>
              ) : (
                <button className="button primary" onClick={() => {
                  const currentIssuesSnapshot = validateApplication(definition, service.getSnapshot().draft);
                  if (plainAtEvidence) {
                    setShowErrors(true);
                    if (currentIssuesSnapshot.length === 0) setScreen("review");
                  } else {
                    const issue = currentIssuesSnapshot.find((candidate) => candidate.fieldId === currentField?.id);
                    if (issue) setShowErrors(true);
                    else { setShowErrors(false); setPlainIndex((value) => value + 1); focusTarget("#main-content h1"); }
                  }
                }}>{plainAtEvidence ? "Review application" : "Next question"} →</button>
              )}
            </div>
            <p className="autosave-note no-print"><Icon name="lock" /> Changes save automatically in this browser only.</p>
          </main>
        </div>
      )}
    </>
  );
}

export { App, FormBridgeErrorBoundary };
