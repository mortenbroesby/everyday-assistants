import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const ledger = new URL("../.friction/", import.meta.url);
const now = new Date();
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const recordPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;

function create(slug) {
  const filename = date + "-" + slug + ".md";
  const record = new URL("active/" + filename, ledger);
  if (existsSync(new URL("archived/" + filename, ledger))) {
    console.error("An archived record already has this filename: " + filename);
    process.exit(1);
  }
  mkdirSync(new URL("active/", ledger), { recursive: true });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ledger,
    encoding: "utf8",
  }).trim();
  const template = readFileSync(new URL("templates/record.md", ledger), "utf8");
  const contents = template
    .replace("{{date}}", date)
    .replace("{{revision}}", revision)
    .replace("{{title}}", slug.replaceAll("-", " "));
  try {
    writeFileSync(record, contents, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
    console.error("An active record already has this filename: " + filename);
    process.exit(1);
  }
  return record;
}

function update(active, archived, note) {
  if (!note?.trim()) {
    throw new Error("Supply a non-empty update in quotes.");
  }
  const record = existsSync(active) ? active : archived;
  appendFileSync(record, "\n## Update " + date + "\n\n" + note.trim() + "\n", {
    flag: constants.O_WRONLY | constants.O_APPEND,
  });
  return record;
}

function move(from, to, unexpectedArgument) {
  if (unexpectedArgument !== undefined) {
    throw new Error("Archive and reopen take only the dated filename.");
  }
  mkdirSync(new URL(".", to), { recursive: true });
  // Linking first prevents overwriting an existing destination.
  linkSync(from, to);
  unlinkSync(from);
  return to;
}

function run([command, name, note, ...extra]) {
  if (command === "new") {
    if (!name || !slugPattern.test(name) || note !== undefined) {
      throw new Error("Usage: pnpm friction new <lowercase-hyphenated-slug>");
    }
    return create(name);
  }
  if (!recordPattern.test(name) || extra.length) {
    throw new Error(
      'Usage: pnpm friction update <dated-filename.md> "<note>" | archive <dated-filename.md> | reopen <dated-filename.md>',
    );
  }
  const active = new URL("active/" + name, ledger);
  const archived = new URL("archived/" + name, ledger);
  switch (command) {
    case "update":
      return update(active, archived, note);
    case "archive":
      return move(active, archived, note);
    case "reopen":
      return move(archived, active, note);
  }
  throw new Error(
    'Usage: pnpm friction new <slug> | update <filename> "<note>" | archive <filename> | reopen <filename>',
  );
}

try {
  console.log(fileURLToPath(run(process.argv.slice(2))));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
