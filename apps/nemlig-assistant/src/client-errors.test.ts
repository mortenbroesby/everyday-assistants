import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BasketPreflightError,
  BasketSnapshotChangedError,
  NemligError as ClientNemligError,
} from './client.js';
import { NemligError } from './nemlig-error.js';

test('NemligError preserves its message, name, optional status, and Error identity', () => {
  const error = new NemligError('Request failed', 503);
  assert.equal(ClientNemligError, NemligError);
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'Request failed');
  assert.equal(error.name, 'NemligError');
  assert.equal(error.status, 503);
  assert.equal(new NemligError('No status').status, undefined);
});

test('basket preflight errors preserve inheritance and messages', () => {
  const preflight = new BasketPreflightError('Must be logged in to add items.');
  assert.ok(preflight instanceof BasketPreflightError);
  assert.ok(preflight instanceof NemligError);
  assert.equal(preflight.message, 'Must be logged in to add items.');
  assert.equal(preflight.name, 'BasketPreflightError');

  const changed = new BasketSnapshotChangedError();
  assert.ok(changed instanceof BasketSnapshotChangedError);
  assert.ok(changed instanceof BasketPreflightError);
  assert.ok(changed instanceof NemligError);
  assert.equal(changed.message, 'Basket changed since the last verified read.');
  assert.equal(changed.name, 'BasketSnapshotChangedError');
});
