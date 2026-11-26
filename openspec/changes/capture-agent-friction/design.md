## Context
See proposal.md. Existing PreToolUse hooks cover JCodeMunch and Fallow. The Nemlig compendium and developer-routing scenarios already provide distinct learning mechanisms.

## Goals / Non-Goals
Provide low-cost capture and discoverable reflection without collecting transcripts or forcing another model turn. Do not create an agent runtime, automatic remediation or global machine configuration.

## Decisions
Use Markdown records and existing GitHub priorities. Keep the record format in one README and add concise lifecycle links. Use native Codex Stop and Interrupt command hooks that return only `systemMessage`; this is a user-visible advisory, not guaranteed model reflection. Agents reflect through lifecycle guidance before completion. Reject `decision:block`: it forces continuation and adds cost even when no friction occurred. Reject transcript mining and mandatory empty-record checks.

Use one small Node script with bounded stdin handling and synthetic tests. Preserve other hook entries. Claude has native Stop semantics but is not configured in this repository; document the portable lifecycle fallback rather than invent an untested second configuration.

## Risks / Trade-offs
- Hook trust is host-owned: script tests do not prove activation; report it unverified until observed in a trusted host.
- A killed process may invoke no hook: capture during work and use next-session handoff recovery.
- Reminders can become noise: evaluate comparable trivial and failed tasks; remove the reminder if it adds no value.
- Markdown validation cannot establish truth/privacy: review content and never require a record count.

## Migration Plan
Deliver one draft PR, no merge/deployment. Host trust is explicit and not changed automatically. Rollback removes only the new hook entries/script and retains historical records.

## Evidence
Official native semantics reviewed 2026-11-27: https://learn.chatgpt.com/docs/hooks and https://code.claude.com/docs/en/hooks. Bundled Codex CLI version observed: 0.169.0-alpha.11.1. Native activation and behavioral improvement are not yet measured.
