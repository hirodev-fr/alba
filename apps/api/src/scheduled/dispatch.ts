import type { PriceCheckParamsV1 } from "@alba/contracts";
import type { DispatchReservation } from "@alba/tracking";

export interface WorkflowBinding {
  create: (options: {
    id: string;
    params: PriceCheckParamsV1;
  }) => Promise<{ id: string }>;
  get: (id: string) => Promise<{ status: () => Promise<unknown> }>;
}
export interface DispatchOperations {
  reserve: () => Promise<DispatchReservation[]>;
  acknowledge: (reservation: DispatchReservation) => Promise<boolean>;
}

const findInstance = async (workflow: WorkflowBinding, id: string) => {
  try {
    const instance = await workflow.get(id);
    await instance.status();
    return true;
  } catch {
    return false;
  }
};

const ensureInstance = async (
  workflow: WorkflowBinding,
  item: DispatchReservation
) => {
  if (
    item.terminal ||
    (item.recovered && (await findInstance(workflow, item.checkId)))
  ) {
    return;
  }
  try {
    await workflow.create({
      id: item.checkId,
      params: { version: 1, checkId: item.checkId },
    });
  } catch {
    // A lost create response is not proof of failure. Never use another ID.
    if (!(await findInstance(workflow, item.checkId))) {
      throw new Error("Workflow start remains unconfirmed");
    }
  }
};

export const dispatchDueChecks = async (
  operations: DispatchOperations,
  workflow: WorkflowBinding
) => {
  const reservations = await operations.reserve();
  const results = await Promise.allSettled(
    reservations.map(async (item) => {
      await ensureInstance(workflow, item);
      return operations.acknowledge(item);
    })
  );
  const acknowledged = results.filter(
    (result) => result.status === "fulfilled" && result.value
  ).length;
  return {
    reserved: reservations.length,
    acknowledged,
    deferred: reservations.length - acknowledged,
  };
};
