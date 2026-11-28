#!/usr/bin/env node

const searchCommand =
  /^\s*(?:\(?\s*)?(?:[A-Za-z_]\w*=\S+\s+)*(?:command\s+)?(?:rg|grep|egrep|fgrep|ag|ack|find)\b/;

const readStdin = () =>
  new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
  });

const run = async () => {
  const input = await readStdin();
  const command = input?.tool_input?.cmd;
  if (
    input?.tool_name !== "exec_command" ||
    typeof command !== "string" ||
    !searchCommand.test(command)
  ) {
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          "Start nontrivial code exploration with JCodeMunch: resolve_repo for this checkout, then one bounded symbol, context, or references query. Use native search for exact literals and small local checks.",
      },
    })}\n`,
  );
};

run().catch(() => {});
