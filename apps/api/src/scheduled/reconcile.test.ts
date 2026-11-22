import { expect, test } from "bun:test";

import type { ReconcileCandidate } from "@alba/tracking";

import type { WorkflowBinding } from "./dispatch";
import { reconcileChecks } from "./reconcile";

const candidate: ReconcileCandidate = {
  checkId: "check-1",
  workflowId: "check-1",
  status: "running",
};
const unavailable = () =>
  Promise.reject(new Error("Unavailable with sensitive details"));
const binding = (status: unknown): WorkflowBinding => ({
  get: () => Promise.resolve({ status: () => Promise.resolve(status) }),
  create: unavailable,
});

test.each(["complete", "errored", "terminated"])(
  "reconciles terminal %s",
  async (status) => {
    const calls: unknown[] = [];
    const result = await reconcileChecks(
      {
        reserve: () => Promise.resolve([candidate]),
        finalize: (id, state) => {
          calls.push([id, state]);
          return Promise.resolve();
        },
      },
      binding({ status, error: { message: "secret" } })
    );
    expect(calls).toEqual([[candidate.checkId, status]]);
    expect(result.finalized).toBe(1);
  }
);

test.each(["running", "queued", "waiting", "paused", "waitingForPause"])(
  "preserves %s instances without finalization or restart",
  async (status) => {
    const result = await reconcileChecks(
      { reserve: () => Promise.resolve([candidate]), finalize: unavailable },
      binding({ status })
    );
    expect(result.active).toBe(1);
    expect(result.deferred).toBe(0);
  }
);

test.each([null, {}, { status: "unknown" }, { status: "new-state" }])(
  "defers uncertain running status %j",
  async (status) => {
    const result = await reconcileChecks(
      { reserve: () => Promise.resolve([candidate]), finalize: unavailable },
      binding(status)
    );
    expect(result.deferred).toBe(1);
    expect(result.finalized).toBe(0);
  }
);

test("uncertain pending start uses the same ID and confirms a lost create response", async () => {
  const calls: string[] = [];
  const result = await reconcileChecks(
    {
      reserve: () => Promise.resolve([{ ...candidate, status: "pending" }]),
      finalize: unavailable,
    },
    {
      get: () => {
        calls.push("get");
        return calls.length === 1
          ? unavailable()
          : Promise.resolve({
              status: () => Promise.resolve({ status: "queued" }),
            });
      },
      create: (input) => {
        expect(input).toEqual({
          id: "check-1",
          params: { version: 1, checkId: "check-1" },
        });
        calls.push("create");
        return unavailable();
      },
    }
  );
  expect(calls).toEqual(["get", "create", "get"]);
  expect(result.active).toBe(1);
});

test("pending crash before creation starts its original obligation", async () => {
  const result = await reconcileChecks(
    {
      reserve: () => Promise.resolve([{ ...candidate, status: "pending" }]),
      finalize: unavailable,
    },
    {
      get: unavailable,
      create: ({ id }) => Promise.resolve({ id }),
    }
  );
  expect(result.started).toBe(1);
});

test("SQL failure and inaccessible instances do not block unrelated checks", async () => {
  const result = await reconcileChecks(
    {
      reserve: () =>
        Promise.resolve([
          candidate,
          { ...candidate, checkId: "check-2", workflowId: "check-2" },
          { ...candidate, checkId: "check-3", workflowId: "check-3" },
        ]),
      finalize: (id) => (id === "check-1" ? unavailable() : Promise.resolve()),
    },
    {
      create: unavailable,
      get: (id) =>
        id === "check-2"
          ? unavailable()
          : Promise.resolve({
              status: () => Promise.resolve({ status: "errored" }),
            }),
    }
  );
  expect(result).toEqual({
    inspected: 3,
    finalized: 1,
    started: 0,
    active: 0,
    deferred: 2,
  });
});

test("reservation failure and mismatched identities cannot create work", async () => {
  await expect(
    reconcileChecks(
      { reserve: unavailable, finalize: unavailable },
      binding({ status: "complete" })
    )
  ).rejects.toThrow();
  const result = await reconcileChecks(
    {
      reserve: () => Promise.resolve([{ ...candidate, workflowId: "other" }]),
      finalize: unavailable,
    },
    binding({ status: "complete" })
  );
  expect(result.deferred).toBe(1);
});
