import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const httpClient = resolve(dirname(fileURLToPath(import.meta.url)), "db-http-client.ts");

register(
  `data:text/javascript,${encodeURIComponent(`
    import { existsSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    const root = ${JSON.stringify(root)};
    const httpClient = ${JSON.stringify(httpClient)};
    function tryResolveFile(base) {
      const candidates = [base, base + ".ts", base + ".tsx", base + ".mjs", base + ".js", base + "/index.ts", base + "/index.mjs"];
      for (const c of candidates) {
        if (existsSync(c)) return pathToFileURL(c).href;
      }
      return null;
    }
    export async function resolve(specifier, context, nextResolve) {
      if (
        specifier === "@/db/client" ||
        specifier.endsWith("/db/client.ts") ||
        specifier.endsWith("/db/client") ||
        specifier.includes("/db/client.ts")
      ) {
        return { shortCircuit: true, url: pathToFileURL(httpClient).href };
      }
      if (specifier.startsWith("@/")) {
        const target = root + "/" + specifier.slice(2);
        const hit = tryResolveFile(target);
        if (hit) return { shortCircuit: true, url: hit };
      } else if (specifier.startsWith(".") && context.parentURL) {
        const parent = new URL(context.parentURL);
        const joined = new URL(specifier, parent).pathname;
        if (!joined.match(/\\.[a-z]+$/i)) {
          const hit = tryResolveFile(joined);
          if (hit) return { shortCircuit: true, url: hit };
        }
      }
      return nextResolve(specifier, context);
    }
  `)}`,
  pathToFileURL("./"),
);
