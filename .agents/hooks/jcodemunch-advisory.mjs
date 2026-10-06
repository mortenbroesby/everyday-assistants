#!/usr/bin/env node

const searchCommand = /^\s*(?:\(?\s*)?(?:[A-Za-z_]\w*=\S+\s+)*(?:command\s+)?(?:rg|grep|egrep|fgrep|ag|ack|find)\b/;

const readStdin = () => new Promise((resolve) => {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      resolve(null);
    }
  });
});

const run = async () => {
  const input = await readStdin();
  const command = input?.tool_input?.cmd;
  if (input?.tool_name !== 'exec_command' || typeof command !== 'string' || !searchCommand.test(command)) return;

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'This is a repository search. Continue when a small local search is enough. If callers, ownership, cross-module impact, or deletion safety remain unclear, use the JCodeMunch routing skill and first verify that its index is this worktree and fresh.',
    },
  })}\n`);
};

run().catch(() => {});
