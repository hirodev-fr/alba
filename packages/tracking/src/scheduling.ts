import { idSchema } from "@alba/contracts";
import type { Database } from "@alba/db";
import { sql } from "drizzle-orm";

export interface DispatchReservation {
  checkId: string;
  productId: string;
  leaseToken: string;
  recovered: boolean;
  terminal: boolean;
}

// One statement commits both the lease and the durable obligation, or neither.
export const reserveDueChecks = async (
  db: Database,
  limit = 20
): Promise<DispatchReservation[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Dispatch batch size must be between 1 and 100");
  }
  const token = crypto.randomUUID();
  const result = await db.execute(sql`
    with due as materialized (
      select s.product_id, s.next_check_at,
        s.lease_token is not null as recovered
      from product_schedules s
      where s.next_check_at <= now()
        and (s.lease_expires_at is null or s.lease_expires_at <= now())
        and (
          exists (select 1 from price_checks c
            where c.product_id = s.product_id and c.scheduled_at = s.next_check_at)
          or exists (select 1 from trackings t where t.product_id = s.product_id
            and t.status = 'active' and t.starts_at <= now() and t.ends_at > now())
        )
        and not exists (select 1 from price_checks c
          where c.product_id = s.product_id and c.status in ('pending', 'running')
            and c.scheduled_at <> s.next_check_at)
      order by s.next_check_at, s.product_id
      limit ${limit}
      for update of s skip locked
    ), leased as (
      update product_schedules s
      set lease_token = ${token}, lease_expires_at = now() + interval '2 minutes'
      from due d where s.product_id = d.product_id
      returning s.product_id, s.next_check_at, d.recovered
    ), checks as (
      insert into price_checks (id, product_id, scheduled_at, workflow_id)
      select id, product_id, next_check_at, id
      from (select gen_random_uuid()::text as id, product_id, next_check_at from leased) fresh
      on conflict (product_id, scheduled_at) do update set scheduled_at = excluded.scheduled_at
      returning id, product_id, status
    )
    select c.id, c.product_id, c.status, l.recovered
    from checks c join leased l on l.product_id = c.product_id
  `);
  return result.rows.map((row) => ({
    checkId: idSchema.parse(row.id),
    productId: idSchema.parse(row.product_id),
    leaseToken: token,
    recovered: row.recovered === true,
    terminal: ["succeeded", "failed", "cancelled"].includes(String(row.status)),
  }));
};

// Fencing prevents a late dispatcher from acknowledging a replacement lease.
export const acknowledgeDispatch = async (
  db: Database,
  reservation: DispatchReservation
): Promise<boolean> => {
  const result = await db.execute(sql`
    update product_schedules s
    set next_check_at = least(
        now() + coalesce((select min(t.interval_seconds) from trackings t
          where t.product_id = s.product_id and t.status = 'active'
            and t.starts_at <= now() and t.ends_at > now()), s.interval_seconds) * interval '1 second',
        (select min(t.starts_at) from trackings t where t.product_id = s.product_id
          and t.status = 'active' and t.starts_at > now())
      ),
      interval_seconds = coalesce((select min(t.interval_seconds) from trackings t
        where t.product_id = s.product_id and t.status = 'active'
          and t.starts_at <= now() and t.ends_at > now()), s.interval_seconds),
      lease_token = null, lease_expires_at = null
    where s.product_id = ${reservation.productId} and s.lease_token = ${reservation.leaseToken}
      and s.lease_expires_at > now()
      and exists (select 1 from price_checks c where c.id = ${reservation.checkId}
        and c.product_id = s.product_id and c.scheduled_at = s.next_check_at)
    returning s.product_id
  `);
  return result.rows.length === 1;
};
