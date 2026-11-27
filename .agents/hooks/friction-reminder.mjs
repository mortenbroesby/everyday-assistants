// Advisory only: no transcript access, file writes, or continuation decisions.
let output = {};
try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (Buffer.byteLength(input) > 65536) {
      input = "";
      break;
    }
  }
  const event = JSON.parse(input);
  if (
    event &&
    ["Stop", "Interrupt"].includes(event.hook_event_name) &&
    event.stop_hook_active !== true
  ) {
    output = {
      systemMessage:
        "Friction reflection: preserve meaningful observed friction using .friction/README.md, or leave a sanitized handoff if writes are not authorized. No record is required when there is nothing meaningful to report. This reminder does not verify capture or task success.",
    };
  }
} catch {
  // Invalid or interrupted input must not prevent the agent from stopping.
}
process.stdout.write(`${JSON.stringify(output)}\n`);
