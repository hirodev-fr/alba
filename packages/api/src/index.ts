import { os } from "@orpc/server";

export const router = { health: os.handler(() => ({ status: "ok" as const })) };
export type Router = typeof router;
