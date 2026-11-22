/* oxlint-disable eslint/no-await-in-loop -- Each attempt and backoff must be durable and sequential. */
import {
  extractionResultV1Schema,
  priceCheckParamsV1Schema,
} from "@alba/contracts";
import type { ExtractionRequestV1, ExtractionResultV1 } from "@alba/contracts";
import type { prepareCheck, recordAttempt } from "@alba/tracking";

export const sqlStepConfig = {
  retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
  timeout: "30 seconds",
} as const;
export const extractionStepConfig = {
  retries: { limit: 0, delay: "10 seconds", backoff: "constant" },
  timeout: "90 seconds",
} as const;

// A runtime port lets tests simulate durable replay without pretending to be Cloudflare.
export interface DurableSteps {
  do: <T>(
    name: string,
    config: typeof sqlStepConfig | typeof extractionStepConfig,
    callback: () => Promise<T>
  ) => Promise<T>;
  sleep: (name: string, duration: "10 seconds" | "20 seconds") => Promise<void>;
}
export interface CheckOperations {
  prepare: (
    checkId: string,
    workflowId: string
  ) => ReturnType<typeof prepareCheck>;
  extract: (request: ExtractionRequestV1) => Promise<ExtractionResultV1>;
  record: (input: Parameters<typeof recordAttempt>[1]) => Promise<void>;
  finalize: (
    checkId: string,
    result: ExtractionResultV1
  ) => Promise<{ status: string }>;
}

export const runPriceCheck = async (
  payload: unknown,
  workflowId: string,
  step: DurableSteps,
  operations: CheckOperations
) => {
  const { checkId } = priceCheckParamsV1Schema.parse(payload);
  const prepared = await step.do("prepare", sqlStepConfig, () =>
    operations.prepare(checkId, workflowId)
  );
  if (prepared.status === "terminal") {
    return { checkId, status: prepared.checkStatus };
  }
  for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
    const attempt = await step.do(
      `extract-http-${attemptNumber}`,
      extractionStepConfig,
      async () => {
        const startedAt = new Date().toISOString();
        const result = extractionResultV1Schema.parse(
          await operations.extract(prepared.request)
        );
        return {
          checkId,
          attemptNumber,
          startedAt,
          finishedAt: new Date().toISOString(),
          result,
        };
      }
    );
    await step.do(`record-attempt-${attemptNumber}`, sqlStepConfig, () =>
      operations.record(attempt)
    );
    if (
      attempt.result.status === "error" &&
      attempt.result.error.category === "temporary" &&
      attemptNumber < 3
    ) {
      await step.sleep(
        `retry-http-${attemptNumber}`,
        attemptNumber === 1 ? "10 seconds" : "20 seconds"
      );
    } else {
      return step.do("finalize", sqlStepConfig, async () => ({
        checkId,
        ...(await operations.finalize(checkId, attempt.result)),
      }));
    }
  }
  throw new Error("Extraction attempt limit exceeded");
};
