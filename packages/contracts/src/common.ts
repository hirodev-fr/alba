import { z } from "zod";

export const contractVersionSchema = z.literal(1);
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
export const timestampSchema = z.iso.datetime({ precision: 3 });
export const currencySchema = z.string().regex(/^[A-Z]{3}$/u);
export const countrySchema = z.string().regex(/^[A-Z]{2}$/u);
export const decimalAmountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u);
export const labelSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim().length > 0);

// Domain names only; DNS resolution and redirects need a server-side policy too.
export const productUrlSchema = z
  .string()
  .max(4096)
  .refine(
    (value) => !/[\p{Cc}\s]/u.test(value),
    "URL whitespace and control characters must be percent-encoded"
  )
  .pipe(z.httpUrl())
  .refine((value) => {
    const url = URL.parse(value);
    if (!url) {
      return false;
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    return !(
      url.username ||
      url.password ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    );
  }, "Expected an HTTP(S) product URL without credentials or a local destination");

export type DecimalAmount = z.infer<typeof decimalAmountSchema>;
