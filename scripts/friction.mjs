import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [command, slug, ...extra] = process.argv.slice(2);
if (
  command !== "new" ||
  !slug ||
  extra.length ||
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)
) {
  console.error("Usage: pnpm friction new <lowercase-hyphenated-slug>");
  process.exit(1);
}

const ledger = new URL("../.friction/", import.meta.url);
const now = new Date();
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");
const filename = date + "-" + slug + ".md";
const record = new URL("active/" + filename, ledger);
if (existsSync(new URL("archived/" + filename, ledger))) {
  console.error("An archived record already has this filename: " + filename);
  process.exit(1);
}
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ledger,
  encoding: "utf8",
}).trim();
const template = readFileSync(new URL("templates/record.md", ledger), "utf8");
const contents = template
  .replace("{{date}}", date)
  .replace("{{revision}}", revision)
  .replace("{{title}}", slug.replaceAll("-", " "));
mkdirSync(new URL(".", record), { recursive: true });
try {
  writeFileSync(record, contents, { flag: "wx" });
} catch (error) {
  if (error.code !== "EEXIST") {
    throw error;
  }
  console.error("An active record already has this filename: " + filename);
  process.exit(1);
}
console.log(fileURLToPath(record));
