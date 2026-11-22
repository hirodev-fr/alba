import { extractionResultV1Schema } from "@alba/contracts";
import type { ExtractionResultV1 } from "@alba/contracts";
import type { Database } from "@alba/db";
import { extractionAttempts } from "@alba/db";

export const recordAttempt = async (
  db: Database,
  input: {
    checkId: string;
    attemptNumber: number;
    startedAt: string;
    finishedAt: string;
    result: ExtractionResultV1;
  }
) => {
  const result = extractionResultV1Schema.parse(input.result);
  await db
    .insert(extractionAttempts)
    .values({
      id: crypto.randomUUID(),
      checkId: input.checkId,
      attemptNumber: input.attemptNumber,
      mode: "http",
      status: result.status === "success" ? "succeeded" : "failed",
      startedAt: new Date(input.startedAt),
      finishedAt: new Date(input.finishedAt),
      durationMs: Math.max(
        0,
        Date.parse(input.finishedAt) - Date.parse(input.startedAt)
      ),
      result,
    })
    .onConflictDoNothing({
      target: [extractionAttempts.checkId, extractionAttempts.attemptNumber],
    });
};
