const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(path) {
  return ts.transpileModule(readFileSync(require.resolve(path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const wrapperSource = compile('../src/NotificationListener.ts');
const messagesSource = compile('../../../src/hooks/use-kakao-messages.ts');
const roomsSource = compile('../../../src/hooks/use-tracked-rooms.ts');
const discoveredRoomsSource = compile('../../../src/hooks/use-discovered-rooms.ts');

function loadWrapper(native) {
  native = { roomResolutionVersion: 1, ...native };
  const context = {
    exports: {}, Error, Promise,
    require(name) {
      if (name === 'expo') return { requireOptionalNativeModule: () => native };
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(wrapperSource, context);
  return context.exports.default;
}

// A minimal hook host exercises asynchronous lifecycle behavior without a new renderer dependency.
function host(source, exportName, listener, foregroundListeners) {
  const slots = [];
  let index = 0;
  let effects = [];
  let stateWrites = 0;
  const same = (left, right) => left && right && left.length === right.length
    && left.every((item, position) => Object.is(item, right[position]));
  const react = {
    useState(initial) {
      const position = index++;
      if (!slots[position]) slots[position] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[position].value, (next) => {
        stateWrites++;
        slots[position].value = typeof next === 'function' ? next(slots[position].value) : next;
      }];
    },
    useRef(initial) {
      const position = index++;
      if (!slots[position]) slots[position] = { current: initial };
      return slots[position];
    },
    useCallback(callback, dependencies) {
      const position = index++;
      if (!same(slots[position]?.dependencies, dependencies)) {
        slots[position] = { callback, dependencies };
      }
      return slots[position].callback;
    },
    useEffect(effect, dependencies) {
      const position = index++;
      if (!same(slots[position]?.dependencies, dependencies)) {
        effects.push(() => {
          slots[position]?.cleanup?.();
          slots[position] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const context = {
    exports: {}, Error, Promise,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { AppState: {
        addEventListener(_name, callback) {
          foregroundListeners.add(callback);
          return { remove() { foregroundListeners.delete(callback); } };
        },
      } };
      if (name === '@/modules/notification-listener') return { __esModule: true, default: listener };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(source, context);
  const hook = context.exports[exportName];
  const result = {
    snapshot() {
      index = 0;
      const value = hook();
      const pending = effects;
      effects = [];
      for (const effect of pending) effect();
      return value;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    stateWrites() { return stateWrites; },
  };
  result.snapshot();
  return result;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(setImmediate);
const message = (id, room) => ({ messageId: id, room, sender: 'Sender', msg: `Message ${id}`, timestamp: id });

function fixture(initialRooms) {
  const state = { rooms: [...initialRooms], reads: 0 };
  const events = new Set();
  const foreground = new Set();
  const native = {
    isPermissionGranted: () => true,
    async getTrackedRooms() { return [...state.rooms]; },
    async setTrackedRooms(rooms) { state.rooms = Array.from(rooms); return [...state.rooms]; },
    async getKakaoMessages() { state.reads++; return state.rooms.map((room) => message(500, room)); },
    addListener(name, callback) {
      assert.equal(name, 'onKakaoMessage');
      events.add(callback);
      return { remove() { events.delete(callback); } };
    },
  };
  return { state, events, foreground, native };
}

test('empty tracked rooms display no messages and skip native history reads', async () => {
  const f = fixture([]);
  const listener = loadWrapper(f.native);
  const hook = host(messagesSource, 'useKakaoMessages', listener, f.foreground);
  await settle();
  const state = hook.snapshot();
  assert.deepEqual(plain(state.messages), []);
  assert.deepEqual(plain(state.trackedRooms), []);
  assert.equal(state.trackingLoading, false);
  assert.equal(state.refreshing, false);
  assert.equal(f.state.reads, 0);
  for (const callback of f.events) callback(message(9, 'Untracked'));
  assert.deepEqual(plain(hook.snapshot().messages), []);
  hook.unmount();
});

test('registering reveals retained messages without a new event and removing keeps them hidden until re-registration', async () => {
  const f = fixture([]);
  const stored = [message(1, 'Observed'), message(2, 'Other hidden room')];
  f.native.getKakaoMessages = async () => {
    f.state.reads++;
    return stored.filter((item) => f.state.rooms.includes(item.room))
      .sort((left, right) => right.timestamp - left.timestamp);
  };
  const listener = loadWrapper(f.native);
  const messages = host(messagesSource, 'useKakaoMessages', listener, f.foreground);
  const tracked = host(roomsSource, 'useTrackedRooms', listener, f.foreground);
  await settle();
  assert.deepEqual(plain(messages.snapshot().messages), []);
  assert.equal(f.state.reads, 0);

  // Registration alone must request already-stored history, even with no message event.
  assert.equal(await tracked.snapshot().addRoom('Observed'), true);
  await settle();
  assert.deepEqual(plain(messages.snapshot().messages.map((item) => item.messageId)), [1]);
  assert.equal(f.state.reads, 1);

  assert.equal(await tracked.snapshot().removeRoom('Observed'), true);
  assert.deepEqual(plain(messages.snapshot().messages), []);
  const whileHidden = message(3, 'Observed');
  stored.push(whileHidden);
  for (const callback of f.events) callback(whileHidden);
  await settle();
  assert.deepEqual(plain(messages.snapshot().messages), []);
  assert.equal(f.state.reads, 1);

  assert.equal(await tracked.snapshot().addRoom('Observed'), true);
  await settle();
  assert.deepEqual(plain(messages.snapshot().messages.map((item) => item.messageId)), [3, 1]);
  assert.equal(f.state.reads, 2);
  assert.equal(stored.length, 3);
  messages.unmount();
  tracked.unmount();
  assert.equal(f.events.size, 0);
  assert.equal(f.foreground.size, 0);
});

for (const staleOperation of ['refresh', 'loadMore']) {
  test(`room changes reject stale ${staleOperation} responses and removed-room live events`, async () => {
    const f = fixture(['A']);
    let resolveOld;
    let hold = false;
    f.native.getKakaoMessages = async () => {
      if (f.state.rooms[0] === 'B') return [message(500, 'B')];
      if (hold) return new Promise((resolve) => { resolveOld = resolve; });
      return Array.from({ length: 100 }, (_, index) => message(200 - index, 'A'));
    };
    const listener = loadWrapper(f.native);
    const hook = host(messagesSource, 'useKakaoMessages', listener, f.foreground);
    await settle();
    assert.equal(hook.snapshot().messages.length, 100);
    assert.equal(hook.snapshot().hasMore, true);
    hold = true;
    const old = hook.snapshot()[staleOperation]();
    await settle();
    assert.equal(typeof resolveOld, 'function');
    await listener.setTrackedRooms(['B']);
    await settle();
    assert.deepEqual(plain(hook.snapshot().messages.map((item) => item.room)), ['B']);
    resolveOld([message(10, 'A')]);
    await old;
    await settle();
    for (const callback of f.events) callback(message(600, 'A'));
    for (const callback of f.events) callback(message(700, 'B'));
    const state = hook.snapshot();
    assert.deepEqual(plain(state.messages.map((item) => item.messageId)), [700, 500]);
    assert.deepEqual(plain(state.trackedRooms), ['B']);
    assert.equal(state.loadingMore, false);
    assert.equal(state.hasMore, false);
    hook.unmount();
    assert.equal(f.events.size, 0);
    assert.equal(f.foreground.size, 0);
  });
}

test('foreground re-reads database room settings before showing history', async () => {
  const f = fixture(['A']);
  const listener = loadWrapper(f.native);
  const hook = host(messagesSource, 'useKakaoMessages', listener, f.foreground);
  await settle();
  assert.deepEqual(plain(hook.snapshot().trackedRooms), ['A']);
  f.state.rooms = ['B'];
  for (const callback of f.foreground) callback('active');
  await settle();
  assert.deepEqual(plain(hook.snapshot().trackedRooms), ['B']);
  assert.deepEqual(plain(hook.snapshot().messages.map((item) => item.room)), ['B']);
  hook.unmount();
});

test('failed room saves return false and keep the confirmed database list visible', async () => {
  const f = fixture(['A']);
  f.native.setTrackedRooms = async () => { throw new Error('저장 실패'); };
  const listener = loadWrapper(f.native);
  const hook = host(roomsSource, 'useTrackedRooms', listener, f.foreground);
  await settle();
  assert.deepEqual(plain(hook.snapshot().rooms), ['A']);
  assert.equal(await hook.snapshot().addRoom('B'), false);
  const state = hook.snapshot();
  assert.deepEqual(plain(state.rooms), ['A']);
  assert.match(state.error, /저장 실패/);
  assert.equal(state.saving, false);
  assert.equal(state.loading, false);
  hook.unmount();
});

test('older APK hooks show a rebuild error and never display unfiltered messages', async () => {
  let messageReads = 0;
  const listener = loadWrapper({
    isPermissionGranted: () => true,
    async getKakaoMessages() { messageReads++; return [message(1, 'Unfiltered')]; },
  });
  const foreground = new Set();
  const messages = host(messagesSource, 'useKakaoMessages', listener, foreground);
  const rooms = host(roomsSource, 'useTrackedRooms', listener, foreground);
  await settle();
  assert.match(messages.snapshot().error, /새 Android 개발 빌드/);
  assert.match(rooms.snapshot().error, /새 Android 개발 빌드/);
  assert.equal(rooms.snapshot().supported, false);
  assert.deepEqual(plain(messages.snapshot().messages), []);
  assert.equal(messageReads, 0);
  messages.unmount();
  rooms.unmount();
});

function discoveryFixture(initialRooms = []) {
  const state = { rooms: [...initialRooms], reads: 0 };
  const events = new Set();
  const foreground = new Set();
  const native = {
    async getDiscoveredRooms() { state.reads++; return [...state.rooms]; },
    addListener(name, callback) {
      assert.equal(name, 'onDiscoveredRoomsChanged');
      events.add(callback);
      return { remove() { events.delete(callback); } };
    },
  };
  return { state, events, foreground, native };
}

test('discovered rooms load without tracking any room and refresh after a native discovery event', async () => {
  const f = discoveryFixture(['First']);
  const listener = loadWrapper(f.native);
  const hook = host(discoveredRoomsSource, 'useDiscoveredRooms', listener, f.foreground);
  await settle();
  assert.equal(hook.snapshot().supported, true);
  assert.deepEqual(plain(hook.snapshot().rooms), ['First']);
  assert.equal(hook.snapshot().loading, false);
  assert.equal(hook.snapshot().error, null);
  f.state.rooms.push('Second');
  for (const callback of f.events) callback({});
  await settle();
  assert.deepEqual(plain(hook.snapshot().rooms), ['First', 'Second']);
  assert.equal(f.state.reads, 2);
  hook.unmount();
  assert.equal(f.events.size, 0);
  assert.equal(f.foreground.size, 0);
});

test('returning to the foreground recovers room names discovered without a JS event', async () => {
  const f = discoveryFixture();
  const hook = host(discoveredRoomsSource, 'useDiscoveredRooms', loadWrapper(f.native), f.foreground);
  await settle();
  f.state.rooms = ['While away'];
  for (const callback of f.foreground) callback('background');
  await settle();
  assert.equal(f.state.reads, 1);
  assert.deepEqual(plain(hook.snapshot().rooms), []);
  for (const callback of f.foreground) callback('active');
  await settle();
  assert.deepEqual(plain(hook.snapshot().rooms), ['While away']);
  assert.equal(f.state.reads, 2);
  hook.unmount();
});

for (const staleResult of ['success', 'failure']) {
  test(`new discovery reads supersede a delayed ${staleResult} without losing the latest list`, async () => {
    const f = discoveryFixture(['Initial']);
    let finishOld;
    let delayNextRead = false;
    f.native.getDiscoveredRooms = async () => {
      if (delayNextRead) {
        delayNextRead = false;
        return new Promise((resolve, reject) => {
          finishOld = () => staleResult === 'success' ? resolve(['Stale']) : reject(new Error('Stale error'));
        });
      }
      return [...f.state.rooms];
    };
    const hook = host(discoveredRoomsSource, 'useDiscoveredRooms', loadWrapper(f.native), f.foreground);
    await settle();
    delayNextRead = true;
    const old = hook.snapshot().refresh();
    await settle();
    assert.equal(typeof finishOld, 'function');
    f.state.rooms = ['Initial', 'Latest'];
    for (const callback of f.events) callback({});
    await settle();
    assert.deepEqual(plain(hook.snapshot().rooms), ['Initial', 'Latest']);
    finishOld();
    await old;
    const state = hook.snapshot();
    assert.deepEqual(plain(state.rooms), ['Initial', 'Latest']);
    assert.equal(state.error, null);
    assert.equal(state.loading, false);
    hook.unmount();
  });
}

test('failed discovery refresh retains known names, reports the failure, and allows retry', async () => {
  const f = discoveryFixture(['Known']);
  let fail = false;
  f.native.getDiscoveredRooms = async () => {
    if (fail) throw new Error('발견한 방 조회 실패');
    return [...f.state.rooms];
  };
  const hook = host(discoveredRoomsSource, 'useDiscoveredRooms', loadWrapper(f.native), f.foreground);
  await settle();
  fail = true;
  await hook.snapshot().refresh();
  assert.deepEqual(plain(hook.snapshot().rooms), ['Known']);
  assert.match(hook.snapshot().error, /발견한 방 조회 실패/);
  assert.equal(hook.snapshot().loading, false);
  fail = false;
  f.state.rooms.push('Recovered');
  await hook.snapshot().refresh();
  assert.deepEqual(plain(hook.snapshot().rooms), ['Known', 'Recovered']);
  assert.equal(hook.snapshot().error, null);
  hook.unmount();
});

for (const lateResult of ['success', 'failure']) {
  test(`discovery teardown ignores a pending ${lateResult} and removes subscriptions`, async () => {
    const f = discoveryFixture();
    let finishRead;
    f.native.getDiscoveredRooms = () => new Promise((resolve, reject) => {
      finishRead = () => lateResult === 'success' ? resolve(['Too late']) : reject(new Error('Too late'));
    });
    const hook = host(discoveredRoomsSource, 'useDiscoveredRooms', loadWrapper(f.native), f.foreground);
    await settle();
    assert.equal(typeof finishRead, 'function');
    hook.unmount();
    assert.equal(f.events.size, 0);
    assert.equal(f.foreground.size, 0);
    const writes = hook.stateWrites();
    finishRead();
    await settle();
    assert.equal(hook.stateWrites(), writes);
  });
}

test('an APK without room discovery can still load and edit manually registered rooms', async () => {
  const f = fixture(['Existing']);
  const listener = loadWrapper(f.native);
  const discovered = host(discoveredRoomsSource, 'useDiscoveredRooms', listener, f.foreground);
  const tracked = host(roomsSource, 'useTrackedRooms', listener, f.foreground);
  await settle();
  assert.equal(discovered.snapshot().supported, false);
  assert.equal(discovered.snapshot().loading, false);
  assert.deepEqual(plain(discovered.snapshot().rooms), []);
  assert.equal(tracked.snapshot().supported, true);
  assert.equal(await tracked.snapshot().addRoom('Typed room'), true);
  assert.deepEqual(plain(tracked.snapshot().rooms), ['Existing', 'Typed room']);
  assert.equal(tracked.snapshot().error, null);
  discovered.unmount();
  tracked.unmount();
  assert.equal(f.foreground.size, 0);
});
