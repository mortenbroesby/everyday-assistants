import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { parseArgs } from "node:util";
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

const fields = {
  title: /^# .+$/mu,
  scope: /^- Scope: .*$/mu,
  task: /^- Task: .*$/mu,
  paths: /^- Paths: .*$/mu,
  category: /^- Category: .*$/mu,
  severity: /^- Severity: .*$/mu,
  observation: "Observation and evidence",
  impact: "Impact",
  hypothesis: "Hypothesis",
  improvement: "Improvement and validation",
  resolution: "Resolution",
};

function replaceField(text, key, value) {
  if (!value.trim()) {
    throw new Error("Empty value for --" + key);
  }
  const field = fields[key];
  if (typeof field === "string") {
    const section = new RegExp(
      "^## " + field + "\\n[\\s\\S]*?(?=\\n#+ |(?![\\s\\S]))",
      "mu",
    );
    if (!section.test(text)) {
      throw new Error("Missing section: " + field);
    }
    return text.replace(
      section,
      () => "## " + field + "\n" + value.trim() + "\n",
    );
  } else {
    if (/[\r\n]/u.test(value) || !field.test(text)) {
      throw new Error("Expected one line for --" + key);
    }
    return text.replace(
      field,
      (line) =>
        (key === "title" ? "# " : line.slice(0, line.indexOf(":") + 1) + " ") +
        value.trim(),
    );
  }
}

function fill(text, args) {
  const options = Object.fromEntries(
    Object.keys(fields).map((key) => [key, { type: "string" }]),
  );
  const { values } = parseArgs({ args, options });
  for (const [key, value] of Object.entries(values)) {
    text = replaceField(text, key, value);
  }
  return text;
}

function filenameFor(name) {
  if (recordPattern.test(name)) {
    return name;
  }
  if (!name || !slugPattern.test(name)) {
    throw new Error("Supply a slug or dated filename.");
  }
  const matches = ["active/", "archived/"].flatMap((folder) => {
    const dir = new URL(folder, ledger);
    return existsSync(dir)
      ? readdirSync(dir).filter(
          (file) => recordPattern.test(file) && file.slice(11, -3) === name,
        )
      : [];
  });
  if (matches.length !== 1) {
    throw new Error(
      "Expected one matching record for " + name + ". Use its dated filename.",
    );
  }
  return matches[0];
}

function create(slug, args) {
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
    writeFileSync(record, fill(contents, args), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
    console.error("An active record already has this filename: " + filename);
    process.exit(1);
  }
  return record;
}

function appendNote(record, note) {
  if (!note?.trim()) {
    throw new Error("Supply a non-empty update in quotes.");
  }
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

function update(record, args) {
  if (args[0]?.startsWith("--")) {
    const contents = fill(readFileSync(record, "utf8"), args);
    writeFileSync(record, contents);
    return record;
  }
  if (args.length !== 1) {
    throw new Error("Supply a quoted note or named fields.");
  }
  return appendNote(record, args[0]);
}

function renameRecord(record, filename, args) {
  const [slug] = args;
  if (args.length !== 1 || !slugPattern.test(slug)) {
    throw new Error("Supply one new slug.");
  }
  const dest = filename.slice(0, 11) + slug + ".md";
  if (
    existsSync(new URL("active/" + dest, ledger)) ||
    existsSync(new URL("archived/" + dest, ledger))
  ) {
    throw new Error("Record already exists: " + dest);
  }
  return move(record, new URL(dest, record));
}

function run([command, name, ...args]) {
  if (command === "new") {
    if (!name || !slugPattern.test(name)) {
      throw new Error("Supply a lowercase hyphenated slug.");
    }
    return create(name, args);
  }
  const filename = filenameFor(name);
  const active = new URL("active/" + filename, ledger);
  const archived = new URL("archived/" + filename, ledger);
  const record = existsSync(active) ? active : archived;
  switch (command) {
    case "update":
      return update(record, args);
    case "rename": {
      return renameRecord(record, filename, args);
    }
    case "archive":
      return move(active, archived, args[0]);
    case "reopen":
      return move(archived, active, args[0]);
    default:
      throw new Error("Choose new, update, rename, archive or reopen.");
  }
}

try {
  console.log(fileURLToPath(run(process.argv.slice(2))));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
