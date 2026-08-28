import Dexie, { type EntityTable } from "dexie";
import type { ApplicationWorkspace } from "../domain/types";
import { applicationWorkspaceSchema } from "./schemas";

interface StoredWorkspace {
  draftId: string;
  formId: string;
  updatedAt: string;
  payload: unknown;
}

interface QuarantinedRecord {
  id?: number;
  draftId: string;
  occurredAt: string;
  reason: string;
}

class FormBridgeDatabase extends Dexie {
  workspaces!: EntityTable<StoredWorkspace, "draftId">;
  quarantine!: EntityTable<QuarantinedRecord, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      workspaces: "&draftId, formId, updatedAt",
      quarantine: "++id, draftId, occurredAt",
    });
    this.version(2)
      .stores({
        workspaces: "&draftId, formId, updatedAt",
        quarantine: "++id, draftId, occurredAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("workspaces")
          .toCollection()
          .modify((record: Partial<StoredWorkspace> & { workspace?: unknown }) => {
            if (record.payload === undefined && record.workspace !== undefined) {
              record.payload = record.workspace;
              delete record.workspace;
            }
          });
      });
  }
}

export interface DraftRepository {
  load(draftId: string): Promise<ApplicationWorkspace | null>;
  save(workspace: ApplicationWorkspace): Promise<void>;
  clear(draftId: string): Promise<boolean>;
  hasDraft(draftId: string): Promise<boolean>;
}

export class IndexedDbDraftRepository implements DraftRepository {
  private readonly database: FormBridgeDatabase;

  constructor(databaseName = "formbridge-local-v1") {
    this.database = new FormBridgeDatabase(databaseName);
  }

  async load(draftId: string): Promise<ApplicationWorkspace | null> {
    const stored = await this.database.workspaces.get(draftId);
    if (!stored) return null;
    const parsed = applicationWorkspaceSchema.safeParse(stored.payload);
    if (parsed.success) return parsed.data as ApplicationWorkspace;

    await this.database.transaction(
      "rw",
      [this.database.workspaces, this.database.quarantine],
      async () => {
        await this.database.quarantine.add({
          draftId,
          occurredAt: new Date().toISOString(),
          reason: "Stored draft failed strict validation.",
        });
        await this.database.workspaces.delete(draftId);
      },
    );
    return null;
  }

  async save(workspace: ApplicationWorkspace): Promise<void> {
    const payload = applicationWorkspaceSchema.parse(workspace) as ApplicationWorkspace;
    await this.database.workspaces.put({
      draftId: payload.draft.id,
      formId: payload.draft.formId,
      updatedAt: payload.draft.updatedAt,
      payload,
    });
  }

  async clear(draftId: string): Promise<boolean> {
    await this.database.workspaces.delete(draftId);
    return (await this.database.workspaces.get(draftId)) === undefined;
  }

  async hasDraft(draftId: string): Promise<boolean> {
    return (await this.database.workspaces.get(draftId)) !== undefined;
  }

  close(): void {
    this.database.close();
  }
}
