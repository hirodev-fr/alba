import { productUrlSchema } from "@alba/contracts";

export const isAllowedProductUrl = (
  value: string,
  allowedHosts?: readonly string[]
): boolean => {
  if (!productUrlSchema.safeParse(value).success) {
    return false;
  }
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    url.port ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".home.arpa")
  ) {
    return false;
  }
  return (
    allowedHosts === undefined ||
    allowedHosts.some(
      (host) => host.toLowerCase().replace(/\.$/u, "") === hostname
    )
  );
};
