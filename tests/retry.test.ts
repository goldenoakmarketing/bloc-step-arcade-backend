import assert from 'node:assert/strict';
import { test } from 'node:test';
// Avoid the development log transport worker; these tests never start the app.
process.env.NODE_ENV = 'test';
const retryTools = import('../src/utils/retry.js');

test('retry returns the first successful result after transient failures', async () => {
  const { retry } = await retryTools;
  let attempts = 0;
  const result = await retry(async () => {
    if (++attempts < 3) throw new Error('synthetic timeout');
    return 'completed';
  }, { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 });
  assert.equal(result, 'completed');
  assert.equal(attempts, 3);
});

test('retry preserves the final error and never exceeds its attempt limit', async () => {
  const { retry } = await retryTools;
  const failure = new Error('synthetic connection error');
  let attempts = 0;
  await assert.rejects(retry(async () => { attempts++; throw failure; },
    { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0 }), error => error === failure);
  assert.equal(attempts, 2);
});

test('nonretryable failures stop immediately', async () => {
  const { retry, isRetryableError } = await retryTools;
  const failure = new Error('invalid input');
  let attempts = 0;
  await assert.rejects(retry(async () => { attempts++; throw failure; },
    { maxAttempts: 3, initialDelayMs: 0, retryIf: isRetryableError }), error => error === failure);
  assert.equal(attempts, 1);
  assert.equal(isRetryableError(new Error('ECONNRESET')), true);
  assert.equal(isRetryableError('timeout'), false);
});
