const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(require.resolve('../src/NotificationListener.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(nativeModule = null, platform = 'android') {
  const context = {
    exports: {},
    require(name) {
      if (name === 'expo') return { requireOptionalNativeModule: () => nativeModule };
      if (name === 'react-native') return { Platform: { OS: platform } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports.default;
}

test('unsupported platforms and Expo Go cannot invoke native collection APIs', async () => {
  for (const platform of ['android', 'web', 'ios']) {
    const listener = load(null, platform);
    assert.equal(listener.isAvailable(), false);
    assert.equal(listener.isPermissionGranted(), false);
    await assert.rejects(listener.getCollectedNotifications(), /Android build/);
    await assert.rejects(listener.clearCollectedNotifications(), /Android build/);
    await assert.rejects(listener.openSettings(), /Android build/);
    assert.throws(() => listener.addNotificationListener(() => {}), /Android build/);
  }
  assert.equal(load({}, 'ios').isAvailable(), false);
  assert.equal(load({}, 'web').isAvailable(), false);
});

test('history is available without current permission and preserves native record metadata', async () => {
  const records = [{ collectionId: 101, key: 'chat', receivedAt: 1234, text: 'hello' }];
  const calls = [];
  const listener = load({
    isPermissionGranted: () => false,
    async getCollectedNotifications(...args) {
      calls.push(args);
      return records;
    },
  });
  assert.equal(listener.isPermissionGranted(), false);
  assert.equal(await listener.getCollectedNotifications(), records);
  assert.equal(await listener.getCollectedNotifications({ limit: 25, beforeId: 101 }), records);
  assert.deepEqual(calls, [[100, null], [25, 101]]);
});

test('unsafe pagination arguments are rejected before they reach Android', async () => {
  let reads = 0;
  const listener = load({ async getCollectedNotifications() { reads++; } });
  for (const limit of [0, -1, 501, 1.5, NaN, Infinity]) {
    await assert.rejects(listener.getCollectedNotifications({ limit }), /limit must be/);
  }
  for (const beforeId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(listener.getCollectedNotifications({ beforeId }), /beforeId must be/);
  }
  assert.equal(reads, 0);
});

test('history failures propagate so callers can distinguish failure from empty history', async () => {
  const failure = new Error('Database unavailable');
  const listener = load({ async getCollectedNotifications() { throw failure; } });
  await assert.rejects(listener.getCollectedNotifications(), (error) => error === failure);
});

test('event subscriptions deliver stored IDs and can be removed without deleting history', async () => {
  const callbacks = new Set();
  let clears = 0;
  let settingsOpened = false;
  const listener = load({
    async openSettings() { settingsOpened = true; },
    async clearCollectedNotifications() { clears++; },
    addListener(name, callback) {
      assert.equal(name, 'onNotificationPosted');
      callbacks.add(callback);
      return { remove() { callbacks.delete(callback); } };
    },
  });
  let received;
  const subscription = listener.addNotificationListener((record) => { received = record; });
  const stored = { collectionId: 7, receivedAt: 100, packageName: 'any.app' };
  for (const callback of callbacks) callback(stored);
  assert.equal(received, stored);
  subscription.remove();
  assert.equal(callbacks.size, 0);
  assert.equal(clears, 0);
  await listener.openSettings();
  assert.equal(settingsOpened, true);
  await listener.clearCollectedNotifications();
  assert.equal(clears, 1);
});
