# Nemlig Food Assistant operating contract

Read the repository-root `AGENTS.md` and `.codex/skills/nemlig-basket/SKILL.md`
before Nemlig work.

- Use the local TypeScript CLI and inspect its current help instead of guessing
  commands or options.
- Never request, print, copy, log, or commit Nemlig credentials. Ask the user to
  run interactive login; never place a password in command arguments.
- Treat product search and basket viewing as read-only discovery.
- Before adding, show the exact product name and ID, package or size, quantity,
  price, and expected line total. Wait for explicit approval; changed details
  require a new proposal and approval.
- Before removing one line, show its exact product ID, name, quantity, and total
  and wait for separate explicit approval. Never substitute a basket clear.
- Before clearing, show the exact current basket and wait for explicit approval.
- Never replace a basket, check out, pay, or place an order.
- End every mutation attempt with the automatic basket readback. Stop and report
  partial success, failed verification, or any mismatch.
- Repository work, a spec, authentication, or tool availability never authorizes
  a Nemlig mutation.
- Model-visible writes must use the matching prepare tool followed by its apply
  tool only after approval. Direct MCP mutation tools are prohibited.
- Follow `SECURE_MCP_TUNNEL.md` for private ChatGPT setup. Never commit tunnel
  profiles, runtime keys, tunnel IDs, or support output.
- After repository changes, run root verification, commit the scoped work, push,
  and verify the remote ref.
