import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../domain/engine";
import { harborReliefDefinition } from "../domain/harbor-relief";
import { IndexedDbDraftRepository } from "./repository";

const databases: string[] = [];

function repository(): IndexedDbDraftRepository {
  const name = `formbridge-test-${crypto.randomUUID()}`;
  databases.push(name);
  return new IndexedDbDraftRepository(name);
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((name) => Dexie.delete(name)));
});

describe("IndexedDB draft repository", () => {
  it("saves and resumes a strictly parsed local workspace", async () => {
    const repo = repository();
    const workspace = createDemoWorkspace(harborReliefDefinition, { completedAnswers: true });

    await repo.save(workspace);
    const loaded = await repo.load(workspace.draft.id);

    expect(loaded).toEqual(workspace);
    repo.close();
  });

  it("clears a draft and verifies it is gone", async () => {
    const repo = repository();
    const workspace = createDemoWorkspace(harborReliefDefinition);
    await repo.save(workspace);

    expect(await repo.clear(workspace.draft.id)).toBe(true);
    expect(await repo.hasDraft(workspace.draft.id)).toBe(false);
    repo.close();
  });

  it("rejects oversized or unknown persisted properties", async () => {
    const repo = repository();
    const workspace = createDemoWorkspace(harborReliefDefinition);
    const corrupted = { ...workspace, unexpected: "must not pass" };

    await expect(repo.save(corrupted as never)).rejects.toThrow();
    repo.close();
  });

  it("quarantines and removes a corrupted stored record on load", async () => {
    const name = `formbridge-test-${crypto.randomUUID()}`;
    databases.push(name);
    const repo = new IndexedDbDraftRepository(name);
    await repo.hasDraft("demo-draft");
    const raw = new Dexie(name);
    await raw.open();
    await raw.table("workspaces").put({
      draftId: "demo-draft",
      formId: harborReliefDefinition.id,
      updatedAt: new Date().toISOString(),
      payload: { hostile: true },
    });
    raw.close();

    expect(await repo.load("demo-draft")).toBeNull();
    expect(await repo.hasDraft("demo-draft")).toBe(false);
    repo.close();
  });
});
