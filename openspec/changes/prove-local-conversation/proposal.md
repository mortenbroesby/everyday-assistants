## Why

Developers need feedback on multi-turn grocery interactions before testing a release in ChatGPT. Separate routing and browser checks can both pass while the tool-result handoff fails.

## What Changes

- Exercise a Danish draft request and redisplay in one native model conversation, then interact with the returned review in a browser.
- Provide a separate operator-invoked loopback check of live, read-only Nemlig interaction.

## Capabilities

### Modified Capabilities

- `nemlig-chatgpt-integration` gains a local acceptance journey.

## Impact

Development harness, synthetic fixture, verification scripts and runbooks. Production deployment and basket permissions retain their existing contracts.
