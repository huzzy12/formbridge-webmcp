import { applyCommand, createDemoWorkspace } from "../domain/engine";
import type {
  ApplicationWorkspace,
  CommandEnvelope,
  CommandResult,
  FormDefinition,
} from "../domain/types";
import type { DraftRepository } from "../persistence/repository";

type Listener = (workspace: ApplicationWorkspace, result?: CommandResult) => void;

export class ApplicationService {
  private workspace: ApplicationWorkspace;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly definition: FormDefinition,
    private readonly repository: DraftRepository,
  ) {
    this.workspace = createDemoWorkspace(definition);
  }

  async initialize(): Promise<{ resumed: boolean; workspace: ApplicationWorkspace }> {
    const stored = await this.repository.load(this.workspace.draft.id);
    if (stored && stored.draft.formId === this.definition.id) {
      this.workspace = stored;
      return { resumed: true, workspace: this.workspace };
    }
    return { resumed: false, workspace: this.workspace };
  }

  getSnapshot(): ApplicationWorkspace {
    return this.workspace;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispatch(envelope: CommandEnvelope): Promise<CommandResult> {
    const outcome = applyCommand(this.definition, this.workspace, envelope);
    if (outcome.workspace !== this.workspace) {
      const previous = this.workspace;
      this.workspace = outcome.workspace;
      for (const listener of this.listeners) listener(this.workspace, outcome.result);
      try {
        await this.repository.save(outcome.workspace);
      } catch (error) {
        this.workspace = previous;
        for (const listener of this.listeners) listener(this.workspace);
        throw error;
      }
    }
    return outcome.result;
  }

  async replaceWithDemo(completedAnswers = true): Promise<ApplicationWorkspace> {
    this.workspace = createDemoWorkspace(this.definition, { completedAnswers });
    await this.repository.save(this.workspace);
    for (const listener of this.listeners) listener(this.workspace);
    return this.workspace;
  }

  async startBlank(): Promise<ApplicationWorkspace> {
    return this.replaceWithDemo(false);
  }

  async clear(): Promise<boolean> {
    const cleared = await this.repository.clear(this.workspace.draft.id);
    if (cleared) {
      this.workspace = createDemoWorkspace(this.definition);
      for (const listener of this.listeners) listener(this.workspace);
    }
    return cleared;
  }
}
