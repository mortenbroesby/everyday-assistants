import assert from 'node:assert/strict';
import test from 'node:test';
import { promptCredentials } from './credential-prompt.js';

test('interactive credential collection fails cleanly without a terminal', async () => {
  await assert.rejects(
    promptCredentials(),
    /Run `pnpm nemlig login --save` in a terminal/,
  );
});
