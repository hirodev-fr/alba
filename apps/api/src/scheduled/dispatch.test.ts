import { expect, test } from "bun:test";

import type { DispatchReservation } from "@alba/tracking";

import worker from "../index";
import { dispatchDueChecks } from "./dispatch";
import type { WorkflowBinding } from "./dispatch";

const reservation: DispatchReservation = {
  checkId: "check-1",
  productId: "product-1",
  leaseToken: "lease-1",
  recovered: false,
  terminal: false,
};
const missing = () => Promise.reject(new Error("Not found"));

test("scheduled export is disabled by default and validates required bindings", async () => {
  expect(typeof worker.fetch).toBe("function");
  await expect(worker.scheduled({}, {})).resolves.toBeUndefined();
  await expect(
    worker.scheduled({}, { DISPATCH_ENABLED: "true" })
  ).rejects.toThrow("bindings");
});

test("reservation failure never starts a workflow", async () => {
  let calls = 0;
  await expect(
    dispatchDueChecks(
      { reserve: missing, acknowledge: () => Promise.resolve(true) },
      {
        create: () => {
          calls += 1;
          return Promise.resolve({ id: "check-1" });
        },
        get: missing,
      }
    )
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test("lost create response is confirmed through status before acknowledgement", async () => {
  const calls: string[] = [];
  const result = await dispatchDueChecks(
    {
      reserve: () => Promise.resolve([reservation]),
      acknowledge: (item) => {
        calls.push(`ack:${item.checkId}`);
        return Promise.resolve(true);
      },
    },
    {
      create: (input) => {
        expect(input).toEqual({
          id: "check-1",
          params: { version: 1, checkId: "check-1" },
        });
        calls.push("create");
        return missing();
      },
      get: () => {
        calls.push("get");
        return Promise.resolve({
          status: () => {
            calls.push("status");
            return Promise.resolve({ status: "queued" });
          },
        });
      },
    }
  );
  expect(calls).toEqual(["create", "get", "status", "ack:check-1"]);
  expect(result).toEqual({ reserved: 1, acknowledged: 1, deferred: 0 });
});

test("unconfirmed starts remain leased while unrelated checks proceed", async () => {
  const acknowledged: string[] = [];
  const result = await dispatchDueChecks(
    {
      reserve: () =>
        Promise.resolve([reservation, { ...reservation, checkId: "check-2" }]),
      acknowledge: (item) => {
        acknowledged.push(item.checkId);
        return Promise.resolve(true);
      },
    },
    {
      create: ({ id }) =>
        id === "check-1" ? missing() : Promise.resolve({ id }),
      get: () => Promise.resolve({ status: missing }),
    }
  );
  expect(acknowledged).toEqual(["check-2"]);
  expect(result.deferred).toBe(1);
});

test.each(["queued", "running", "complete", "errored", "terminated"])(
  "reclaimed lease finds %s instance without recreating it",
  async (status) => {
    let creates = 0;
    const workflow: WorkflowBinding = {
      create: () => {
        creates += 1;
        return missing();
      },
      get: () => Promise.resolve({ status: () => Promise.resolve({ status }) }),
    };
    const result = await dispatchDueChecks(
      {
        reserve: () => Promise.resolve([{ ...reservation, recovered: true }]),
        acknowledge: () => Promise.resolve(true),
      },
      workflow
    );
    expect(creates).toBe(0);
    expect(result.acknowledged).toBe(1);
  }
);

test("crash before create recovers with the original ID; failed acknowledgement stays deferred", async () => {
  const ids: string[] = [];
  const result = await dispatchDueChecks(
    {
      reserve: () => Promise.resolve([{ ...reservation, recovered: true }]),
      acknowledge: () => Promise.reject(new Error("SQL down")),
    },
    {
      create: ({ id }) => {
        ids.push(id);
        return Promise.resolve({ id });
      },
      get: missing,
    }
  );
  expect(ids).toEqual(["check-1"]);
  expect(result.deferred).toBe(1);
});

test("terminal SQL checks need no instance and stale acknowledgements are deferred", async () => {
  const result = await dispatchDueChecks(
    {
      reserve: () => Promise.resolve([{ ...reservation, terminal: true }]),
      acknowledge: () => Promise.resolve(false),
    },
    { create: missing, get: missing }
  );
  expect(result.deferred).toBe(1);
});
