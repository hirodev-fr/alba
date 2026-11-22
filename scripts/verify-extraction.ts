import { createZyteExtractor } from "../packages/extraction/src";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  throw new Error("Set ZYTE_API_KEY in the ignored local .env file.");
}
const extract = createZyteExtractor({
  apiKey,
  allowedHosts: ["books.toscrape.com"],
});
const result = await extract({
  version: 1,
  mode: "http",
  offer: {
    url: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    context: {
      variant: {},
      country: null,
      seller: null,
      expectedCurrency: "GBP",
    },
  },
});
if (result.status === "error") {
  throw new Error(
    `Zyte verification failed: ${result.error.category}/${result.error.code}`
  );
}
if (result.price.amount !== "51.77" || result.price.currency !== "GBP") {
  throw new Error(
    "Extracted price differs from the reference book (51.77 GBP); inspect the public page before updating the expectation."
  );
}
process.stdout.write(`${JSON.stringify(result)}\n`);
