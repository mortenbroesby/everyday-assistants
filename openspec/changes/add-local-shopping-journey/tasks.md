## 1. Manual acceptance

- [x] 1.1 Provide independent adapter, MCP and widget checks and a root command for all three.
- [x] 1.2 Verify the optional native two-turn conversation and its widget handoff.
- [x] 1.3 Provide the opt-in real-account read profile and verify its offline safeguards.
- [x] 1.4 Run the combined deterministic smoke and confirm exact-draft readback.
- [ ] 1.5 Run the optional local Wrangler profile on the integrated checkout.

## Observed evidence

The combined deterministic command passed all 91 provider checks, the host-neutral MCP journey, and the scripted Chrome edit with exact-draft readback. The signed-in Codex CLI selected `find_groceries`, `start_product_review` and `show_product_review` across the two Danish turns. Chrome rendered the actual show result. The widget edit and original-draft MCP readback both returned two units, with zero forbidden provider calls. Eight local provider/configuration checks passed. Real provider reads require selecting the operator profile.

NEM-CHATGPT-006 passed for local keyboard row actions and the quantity edit. NEM-CHATGPT-001 was not run in installed ChatGPT. NEM-CHATGPT-002 through 005, 007 and 008 are inapplicable to the successful temporary-draft scenario (recovery, submission, replacement or localization).
