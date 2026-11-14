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
  // Fixtures model the current APK unless they explicitly override its capability version.
  if (nativeModule) nativeModule = { roomResolutionVersion: 1, ...nativeModule };
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
    assert.equal(listener.isDiscoveredRoomsSupported(), false);
    assert.equal(listener.isFavoritesSupported(), false);
    assert.equal(listener.isPermissionGranted(), false);
    await assert.rejects(listener.getCollectedNotifications(), /Android build/);
    await assert.rejects(listener.getKakaoMessages(), /Android build/);
    await assert.rejects(listener.clearKakaoMessages(), /Android build/);
    await assert.rejects(listener.clearCollectedNotifications(), /Android build/);
    await assert.rejects(listener.getTrackedRooms(), /Android build/);
    await assert.rejects(listener.getDiscoveredRooms(), /Android build/);
    await assert.rejects(listener.getFavoriteMessages(), /Android build/);
    await assert.rejects(listener.getKakaoMessage(1), /Android build/);
    await assert.rejects(listener.setMessageFavorite(1, true), /Android build/);
    await assert.rejects(listener.setTrackedRooms([]), /Android build/);
    await assert.rejects(listener.openSettings(), /Android build/);
    assert.throws(() => listener.addNotificationListener(() => {}), /Android build/);
    assert.throws(() => listener.addKakaoMessageListener(() => {}), /Android build/);
    assert.throws(() => listener.addDiscoveredRoomsListener(() => {}), /Android build/);
  }
  assert.equal(load({}, 'ios').isAvailable(), false);
  assert.equal(load({}, 'web').isAvailable(), false);
});

function favoriteNative(overrides = {}) {
  return {
    async getKakaoMessages() { return []; },
    async getKakaoMessage() { return null; },
    async getFavoriteMessages() { return []; },
    async setMessageFavorite(messageId, isFavorite) { return { messageId, isFavorite }; },
    ...overrides,
  };
}

test('favorites require the complete native API while older APK message reading stays available', async () => {
  for (const missing of ['getKakaoMessage', 'getFavoriteMessages', 'setMessageFavorite']) {
    const native = favoriteNative({ [missing]: undefined, async getKakaoMessages() { return []; } });
    const listener = load(native);
    assert.equal(listener.isFavoritesSupported(), false);
    assert.deepEqual(Array.from(await listener.getKakaoMessages()), []);
    await assert.rejects(listener.getKakaoMessage(1), /새 Android 개발 빌드/);
    await assert.rejects(listener.getFavoriteMessages(), /새 Android 개발 빌드/);
    await assert.rejects(listener.setMessageFavorite(1, true), /새 Android 개발 빌드/);
  }
  const unsafe = load(favoriteNative({ roomResolutionVersion: 0 }));
  assert.equal(unsafe.isFavoritesSupported(), false);
  await assert.rejects(unsafe.getFavoriteMessages(), /채팅방 이름 추출/);
});

test('favorite history uses native pagination and detail preserves missing and saved records', async () => {
  const saved = { messageId: 21, room: 'Saved room', msg: 'Saved body', isFavorite: true };
  const calls = [];
  const listener = load(favoriteNative({
    async getKakaoMessage(id) { return id === saved.messageId ? saved : null; },
    async getFavoriteMessages(...args) { calls.push(args); return [saved]; },
  }));
  assert.equal(listener.isFavoritesSupported(), true);
  assert.deepEqual(Array.from(await listener.getFavoriteMessages()), [saved]);
  assert.deepEqual(Array.from(await listener.getFavoriteMessages({ limit: 7, beforeId: 21 })), [saved]);
  assert.deepEqual(calls, [[100, null], [7, 21]]);
  assert.deepEqual(await listener.getKakaoMessage(21), saved);
  assert.equal(await listener.getKakaoMessage(22), null);
});

test('unsafe favorite IDs, booleans, and pagination never reach the native store', async () => {
  let calls = 0;
  const listener = load(favoriteNative({
    async getKakaoMessage() { calls++; },
    async getFavoriteMessages() { calls++; },
    async setMessageFavorite() { calls++; },
  }));
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(listener.getKakaoMessage(id));
    await assert.rejects(listener.setMessageFavorite(id, true));
  }
  for (const isFavorite of [undefined, null, 0, 1, 'true']) {
    await assert.rejects(listener.setMessageFavorite(1, isFavorite));
  }
  for (const options of [{ limit: 0 }, { limit: 501 }, { beforeId: 0 }, { beforeId: 1.5 }]) {
    await assert.rejects(listener.getFavoriteMessages(options));
  }
  assert.equal(calls, 0);
});

test('favorite changes publish only committed records and subscriber errors cannot fail a saved write', async () => {
  let confirm;
  const listener = load(favoriteNative({
    setMessageFavorite(messageId, isFavorite) {
      return new Promise((resolve) => { confirm = () => resolve({ messageId, isFavorite, room: 'Saved' }); });
    },
  }));
  const changes = [];
  const bad = listener.addFavoriteMessagesListener(() => { throw new Error('Broken screen'); });
  const good = listener.addFavoriteMessagesListener((record) => changes.push(record));
  const save = listener.setMessageFavorite(9, true);
  await new Promise(setImmediate);
  assert.deepEqual(changes, []);
  confirm();
  const saved = await save;
  assert.equal(saved.isFavorite, true);
  assert.deepEqual(JSON.parse(JSON.stringify(changes)), [saved]);
  bad.remove();
  good.remove();
  const remove = listener.setMessageFavorite(9, false);
  await new Promise(setImmediate);
  confirm();
  await remove;
  assert.equal(changes.length, 1);
});

test('failed favorite changes emit no update and a later edit can still succeed', async () => {
  const failure = new Error('Favorites database full');
  let writes = 0;
  const listener = load(favoriteNative({
    async setMessageFavorite(messageId, isFavorite) {
      if (++writes === 1) throw failure;
      return { messageId, isFavorite };
    },
  }));
  const changes = [];
  listener.addFavoriteMessagesListener((record) => changes.push(record));
  const first = listener.setMessageFavorite(9, true);
  const next = listener.setMessageFavorite(10, true);
  await assert.rejects(first, (error) => error === failure);
  const saved = await next;
  assert.equal(saved.messageId, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(changes)), [saved]);
});

test('discovery requires a compatible APK without disabling existing tracking APIs', async () => {
  const listener = load({
    async getTrackedRooms() { return ['Saved']; },
    async setTrackedRooms(rooms) { return rooms; },
  });
  assert.equal(listener.isTrackedRoomsSupported(), true);
  assert.equal(listener.isDiscoveredRoomsSupported(), false);
  assert.deepEqual(Array.from(await listener.getTrackedRooms()), ['Saved']);
  await assert.rejects(listener.getDiscoveredRooms(), /발견한 채팅방.*새 Android 개발 빌드/);
  assert.throws(() => listener.addDiscoveredRoomsListener(() => {}), /새 Android 개발 빌드/);
  assert.throws(() => listener.addListener('onDiscoveredRoomsChanged', () => {}), /새 Android 개발 빌드/);

  const unsafe = load({ roomResolutionVersion: 0, async getDiscoveredRooms() { return ['Sender']; } });
  assert.equal(unsafe.isDiscoveredRoomsSupported(), false);
  await assert.rejects(unsafe.getDiscoveredRooms(), /채팅방 이름 추출/);
});

test('discovered names are normalized without changing tracked rooms or reading message bodies', async () => {
  const listener = load({
    isPermissionGranted: () => false,
    async getDiscoveredRooms() { return [' Team B ', '', 'Team A', 'Team B', 'team a']; },
    async getKakaoMessages() { assert.fail('Discovery must not read messages'); },
    async setTrackedRooms() { assert.fail('Discovery must not register rooms'); },
  });
  assert.equal(listener.isDiscoveredRoomsSupported(), true);
  assert.deepEqual(Array.from(await listener.getDiscoveredRooms()), ['Team A', 'Team B', 'team a']);
});

test('discovery events can refresh names independently of message events and unsubscribe', async () => {
  const callbacks = new Set();
  const listener = load({
    async getDiscoveredRooms() { return []; },
    addListener(name, callback) {
      assert.equal(name, 'onDiscoveredRoomsChanged');
      callbacks.add(callback);
      return { remove() { callbacks.delete(callback); } };
    },
  });
  let updates = 0;
  const first = listener.addDiscoveredRoomsListener(() => { updates++; });
  const second = listener.addListener('onDiscoveredRoomsChanged', () => { updates++; });
  for (const callback of callbacks) callback({});
  assert.equal(updates, 2);
  first.remove();
  second.remove();
  assert.equal(callbacks.size, 0);
});

test('discovery read failures remain distinguishable from an empty list', async () => {
  const failure = new Error('Discovered rooms unavailable');
  const listener = load({ async getDiscoveredRooms() { throw failure; } });
  await assert.rejects(listener.getDiscoveredRooms(), (error) => error === failure);
});

test('tracking settings require both native APIs and give older APKs a Korean rebuild instruction', async () => {
  for (const native of [{}, { getTrackedRooms() {} }, { setTrackedRooms() {} }]) {
    const listener = load(native);
    assert.equal(listener.isTrackedRoomsSupported(), false);
    await assert.rejects(listener.getTrackedRooms(), /추적 채팅방.*새 Android 개발 빌드/);
    await assert.rejects(listener.setTrackedRooms(['Room']), /새 Android 개발 빌드/);
    await assert.rejects(listener.addTrackedRoom('Room'), /새 Android 개발 빌드/);
  }
});

test('APKs with the old sender-as-room parser cannot supply tracking settings or messages', async () => {
  let reads = 0;
  for (const roomResolutionVersion of [undefined, 0]) {
    const listener = load({
      roomResolutionVersion,
      async getTrackedRooms() { reads++; return ['Sender']; },
      async setTrackedRooms() { throw new Error('Must not write to an old APK'); },
      async getKakaoMessages() { reads++; return [{ room: 'Sender', roomSource: 'title' }]; },
    });
    assert.equal(listener.isTrackedRoomsSupported(), false);
    await assert.rejects(listener.getTrackedRooms(), /채팅방 이름 추출.*새 Android 개발 빌드/);
    await assert.rejects(listener.setTrackedRooms(['Sender']), /채팅방 이름 추출/);
    await assert.rejects(listener.getKakaoMessages(), /채팅방 이름 추출/);
    assert.throws(() => listener.addKakaoMessageListener(() => {}), /채팅방 이름 추출/);
  }
  assert.equal(reads, 0);
});

test('tracked rooms are normalized and published only after the database confirms a save', async () => {
  let confirmSave;
  let submitted;
  const listener = load({
    async getTrackedRooms() { return []; },
    setTrackedRooms(rooms) {
      submitted = Array.from(rooms);
      return new Promise((resolve) => { confirmSave = resolve; });
    },
  });
  assert.equal(listener.isTrackedRoomsSupported(), true);
  const changes = [];
  const subscription = listener.addTrackedRoomsListener((rooms) => changes.push(Array.from(rooms)));
  const pending = listener.setTrackedRooms([' Beta ', '', 'Alpha', 'Beta', '  ', ' Alpha ']);
  await Promise.resolve();
  assert.deepEqual(submitted, ['Alpha', 'Beta']);
  assert.deepEqual(changes, []);
  confirmSave(['Alpha', 'Beta']);
  assert.deepEqual(Array.from(await pending), ['Alpha', 'Beta']);
  assert.deepEqual(changes, [['Alpha', 'Beta']]);
  subscription.remove();
});

test('failed tracking writes publish nothing and do not poison the next queued edit', async () => {
  const failure = new Error('DB full');
  let rooms = ['Saved'];
  let writes = 0;
  const listener = load({
    async getTrackedRooms() { return rooms; },
    async setTrackedRooms(next) {
      if (++writes === 1) throw failure;
      rooms = Array.from(next);
      return rooms;
    },
  });
  const changes = [];
  listener.addTrackedRoomsListener((next) => changes.push(Array.from(next)));
  const failed = listener.addTrackedRoom('Failed');
  const successful = listener.addTrackedRoom('Added');
  await assert.rejects(failed, (error) => error === failure);
  assert.deepEqual(Array.from(await successful), ['Added', 'Saved']);
  assert.deepEqual(changes, [['Added', 'Saved']]);
});

test('read-modify-write tracking edits from multiple tabs are serialized without losing names', async () => {
  let rooms = ['Original'];
  let activeWrites = 0;
  let maximumWrites = 0;
  const writes = [];
  const listener = load({
    async getTrackedRooms() { return [...rooms]; },
    async setTrackedRooms(next) {
      maximumWrites = Math.max(maximumWrites, ++activeWrites);
      await Promise.resolve();
      rooms = Array.from(next);
      writes.push([...rooms]);
      activeWrites -= 1;
      return [...rooms];
    },
  });
  await Promise.all([
    listener.addTrackedRoom(' A '), listener.addTrackedRoom('B'),
    listener.removeTrackedRoom('Original'), listener.setTrackedRooms(['Only']),
    listener.addTrackedRoom('Last'),
  ]);
  assert.equal(maximumWrites, 1);
  assert.deepEqual(writes, [
    ['A', 'Original'], ['A', 'B', 'Original'], ['A', 'B'], ['Only'], ['Last', 'Only'],
  ]);
  assert.deepEqual(Array.from(await listener.getTrackedRooms()), ['Last', 'Only']);
});

test('empty tracked rooms persist and unchanged reads do not repeatedly invalidate history', async () => {
  let rooms = ['Room'];
  let reads = 0;
  const listener = load({
    async getTrackedRooms() { reads++; return [...rooms]; },
    async setTrackedRooms(next) { rooms = Array.from(next); return rooms; },
  });
  const changes = [];
  listener.addTrackedRoomsListener((next) => changes.push(Array.from(next)));
  await listener.getTrackedRooms();
  await listener.getTrackedRooms();
  assert.deepEqual(Array.from(await listener.setTrackedRooms([])), []);
  await listener.getTrackedRooms();
  assert.deepEqual(changes, [['Room'], []]);
  assert.equal(reads, 3);
  await assert.rejects(listener.addTrackedRoom('  '), /채팅방 이름을 입력/);
  await assert.rejects(listener.setTrackedRooms([null]), /문자열 목록/);
  assert.equal(reads, 3);
});

test('older Android builds report the required upgrade before invoking new native APIs', async () => {
  const listener = load({ isPermissionGranted: () => true });
  await assert.rejects(listener.getKakaoMessages(), /새 Android 개발 빌드/);
  await assert.rejects(listener.clearKakaoMessages(), /새 Android 개발 빌드/);
  assert.throws(() => listener.addKakaoMessageListener(() => {}), /새 Android 개발 빌드/);
  assert.throws(() => listener.addListener('onKakaoMessage', () => {}), /새 Android 개발 빌드/);
});

test('Kakao history pagination preserves extraction sources and message timestamps', async () => {
  const records = [{
    messageId: 12, room: '수학과제토론방', sender: '사용자A', msg: '문제 같이 풀어요',
    timestamp: 1793433482809, timestampSource: 'message', roomSource: 'conversationTitle',
    isGroupChat: true, isGroupChatSource: 'notification', notificationKey: 'chat-1',
  }];
  const calls = [];
  const listener = load({
    async getKakaoMessages(...args) { calls.push(args); return records; },
  });
  assert.equal(await listener.getKakaoMessages(), records);
  assert.equal(await listener.getKakaoMessages({ limit: 50, beforeId: 12 }), records);
  assert.deepEqual(calls, [[100, null], [50, 12]]);
  for (const options of [{ limit: 0 }, { limit: 501 }, { beforeId: 0 }, { beforeId: 1.5 }]) {
    await assert.rejects(listener.getKakaoMessages(options), /must be/);
  }
  assert.equal(calls.length, 2);
});

test('Kakao events expose the generic and convenience subscription APIs', async () => {
  const callbacks = new Set();
  let cleared = false;
  const listener = load({
    async getKakaoMessages() { return []; },
    async clearKakaoMessages() { cleared = true; },
    addListener(name, callback) {
      assert.equal(name, 'onKakaoMessage');
      callbacks.add(callback);
      return { remove() { callbacks.delete(callback); } };
    },
  });
  const received = [];
  const first = listener.addListener('onKakaoMessage', (message) => received.push(message));
  const second = listener.addKakaoMessageListener((message) => received.push(message));
  const message = { messageId: 3, room: 'Room', sender: 'Sender', msg: 'Body', timestamp: 100 };
  for (const callback of callbacks) callback(message);
  assert.deepEqual(received, [message, message]);
  first.remove();
  second.remove();
  assert.equal(callbacks.size, 0);
  assert.equal(cleared, false);
  await listener.clearKakaoMessages();
  assert.equal(cleared, true);
});

test('Kakao history read failures remain distinguishable from an empty list', async () => {
  const failure = new Error('Kakao database unavailable');
  const listener = load({ async getKakaoMessages() { throw failure; } });
  await assert.rejects(listener.getKakaoMessages(), (error) => error === failure);
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
