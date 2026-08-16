import { mkdir, writeFile } from "node:fs/promises";

const version =
  process.env.NEXT_PUBLIC_COURTRUSH_VERSION ||
  `courtrush-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

await mkdir("public", { recursive: true });
await writeFile(
  "public/build-version.json",
  `${JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

console.log(`CourtRush build version: ${version}`);
