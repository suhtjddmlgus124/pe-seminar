const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');

// Exercise the native store's SQL using SQLite itself, without generating an Android project.
const source = readFileSync(require.resolve(
  '../android/src/main/java/expo/modules/notificationlistener/NotificationStore.kt'
), 'utf8');
const tableDefinitions = [...source.matchAll(/"""([\s\S]*?)"""/g)].map((match) => match[1]);
const rawTable = tableDefinitions.find((sql) => sql.includes('CREATE TABLE notifications'));
const messageTable = tableDefinitions.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS kakao_messages'));
const legacyMessageTable = messageTable.replace(/,\s*is_favorite INTEGER NOT NULL DEFAULT 0/, '');
const trackedTable = source.match(/db\.execSQL\("(CREATE TABLE IF NOT EXISTS tracked_rooms[^"\n]*)"\)/)[1];
const discoveredTable = source.match(/db\.execSQL\("(CREATE TABLE IF NOT EXISTS discovered_rooms[^"\n]*)"\)/)[1];
const addRoomColumn = source.match(/db\.execSQL\("(ALTER TABLE kakao_messages[^"\n]*)"\)/)[1];
const addRoomSourceColumn = source.match(/db\.execSQL\("(ALTER TABLE kakao_messages ADD COLUMN room_source[^"\n]*)"\)/)[1];
const addFavoriteColumn = source.match(/db\.execSQL\("(ALTER TABLE kakao_messages ADD COLUMN is_favorite[^"\n]*)"\)/)[1];
const roomIndex = source.match(/"(CREATE INDEX IF NOT EXISTS kakao_messages_room_timestamp_id[^"\n]*)"\s*\+\s*"([^"\n]*)"/).slice(1).join('');
const favoriteIndex = source.match(/"(CREATE INDEX IF NOT EXISTS kakao_messages_favorite_timestamp_id[^"\n]*)"\s*\+\s*"([^"\n]*)"/).slice(1).join('');
const joinedTables = source.match(/"(kakao_messages AS messages INNER JOIN tracked_rooms[^"\n]*)"/)[1];
const cursorSelection = source.match(/"(messages\.timestamp < [^"\n]*)"/)[1];
const messageOrder = source.match(/"(messages\.timestamp DESC, messages\.message_id DESC)"/)[1];
const verifiedSelection = source.match(/VERIFIED_ROOM_SELECTION\s*=\s*"([^"\n]*)"/)[1];
const visibleSelection = source.match(/VISIBLE_MESSAGE_SELECTION\s*=\s*"([^"\n]*)"/)[1];
const verifiedSources = new Set([
  ...verifiedSelection.match(/IN \(([^)]*)\)/)[1].matchAll(/'([^']+)'/g),
].map((match) => match[1]));

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(rawTable);
  db.exec(messageTable);
  db.exec(trackedTable);
  db.exec(discoveredTable);
  db.exec(roomIndex);
  db.exec(favoriteIndex);
  return db;
}

function register(db, rooms) {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM tracked_rooms');
    for (const room of rooms) db.prepare('INSERT INTO tracked_rooms(name) VALUES (?)').run(room);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function insertMessage(db, room, timestamp, roomSource = 'conversationTitle') {
  const sequence = db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count;
  const payload = JSON.stringify({ room, roomSource, sender: 'Bob', msg: `message ${sequence}`, timestamp });
  return db.prepare('INSERT INTO kakao_messages(fingerprint,payload,timestamp,room,room_source) VALUES (?,?,?,?,?)')
    .run(`fingerprint-${sequence}`, payload, timestamp, room, roomSource ?? 'unknown').lastInsertRowid;
}

function page(db, limit, beforeId = null, favoritesOnly = false) {
  let args = [];
  let selection = ` WHERE ${verifiedSelection}${favoritesOnly ? ' AND messages.is_favorite = 1' : ''}`;
  if (beforeId !== null) {
    const cursor = db.prepare('SELECT timestamp FROM kakao_messages WHERE message_id = ?').get(beforeId);
    if (!cursor) return [];
    selection += ` AND (${cursorSelection})`;
    args = [cursor.timestamp, cursor.timestamp, beforeId];
  }
  return db.prepare(
    `SELECT messages.message_id AS id, messages.payload, messages.is_favorite FROM ${favoritesOnly ? 'kakao_messages AS messages' : joinedTables}${selection} ORDER BY ${messageOrder} LIMIT ?`
  ).all(...args, limit).map((row) => ({ ...JSON.parse(row.payload), id: row.id, isFavorite: row.is_favorite === 1 }));
}

function detail(db, messageId) {
  const row = db.prepare(
    `SELECT messages.message_id, messages.payload, messages.is_favorite FROM kakao_messages AS messages WHERE messages.message_id = ? AND ${verifiedSelection} AND (${visibleSelection})`
  ).get(messageId);
  return row ? { ...JSON.parse(row.payload), messageId: row.message_id, isFavorite: row.is_favorite === 1 } : null;
}

function setFavorite(db, messageId, favorite) {
  db.exec('BEGIN');
  try {
    const message = detail(db, messageId);
    if (!message) throw new Error('Message is missing or hidden');
    db.prepare('UPDATE kakao_messages SET is_favorite = ? WHERE message_id = ?').run(favorite ? 1 : 0, messageId);
    db.exec('COMMIT');
    return { ...message, isFavorite: favorite };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function migrateVerifiedRooms(db) {
  for (const row of db.prepare('SELECT message_id,payload FROM kakao_messages ORDER BY message_id ASC').all()) {
    let payload;
    try {
      payload = JSON.parse(row.payload);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payload');
    } catch {
      db.prepare('UPDATE kakao_messages SET room = ?, room_source = ? WHERE message_id = ?')
        .run('', 'unknown', row.message_id);
      continue;
    }
    if (typeof payload.room !== 'string' || !payload.room.trim() || !verifiedSources.has(payload.roomSource)) {
      payload.room = '';
      payload.roomSource = 'unknown';
    }
    db.prepare('UPDATE kakao_messages SET room = ?, room_source = ?, payload = ? WHERE message_id = ?')
      .run(payload.room, payload.roomSource, JSON.stringify(payload), row.message_id);
  }
}

test('v5 discovery migration preserves existing history and tracking settings', () => {
  const db = createDatabase();
  try {
    db.exec('DROP TABLE discovered_rooms');
    register(db, ['공지방']);
    const id = insertMessage(db, '공지방', 100);
    db.prepare('INSERT INTO notifications(notification_key,post_time,fingerprint,payload,received_at) VALUES (?,?,?,?,?)')
      .run('existing', 100, 'raw-existing', '{"text":"existing body"}', 200);
    const messages = db.prepare('SELECT * FROM kakao_messages').all();
    const notifications = db.prepare('SELECT * FROM notifications').all();
    db.exec('BEGIN');
    db.exec(discoveredTable);
    db.exec('COMMIT');
    assert.deepEqual(db.prepare('SELECT * FROM discovered_rooms').all(), []);
    assert.deepEqual(db.prepare('SELECT * FROM kakao_messages').all(), messages);
    assert.deepEqual(db.prepare('SELECT * FROM notifications').all(), notifications);
    assert.deepEqual(page(db, 10).map((row) => row.id), [id]);
    assert.deepEqual(db.prepare('SELECT name FROM tracked_rooms').all().map((row) => row.name), ['공지방']);
  } finally {
    db.close();
  }
});

test('v6 migration adds unfavorited defaults without changing prior records or room settings', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of [rawTable, legacyMessageTable, trackedTable, discoveredTable]) db.exec(sql);
    register(db, ['Room']);
    db.prepare('INSERT INTO discovered_rooms(name) VALUES (?)').run('Other');
    const id = insertMessage(db, 'Room', 100);
    const previous = db.prepare('SELECT * FROM kakao_messages').get();
    db.prepare('INSERT INTO notifications(notification_key,post_time,fingerprint,payload,received_at) VALUES (?,?,?,?,?)')
      .run('old', 100, 'old-raw', '{"text":"retained"}', 200);
    const raw = db.prepare('SELECT * FROM notifications').get();
    db.exec('BEGIN');
    db.exec(addFavoriteColumn);
    db.exec(favoriteIndex);
    db.exec('COMMIT');
    const migrated = db.prepare('SELECT * FROM kakao_messages').get();
    assert.deepEqual({ ...migrated }, { ...previous, is_favorite: 0 });
    assert.deepEqual(db.prepare('SELECT * FROM notifications').get(), raw);
    assert.deepEqual(db.prepare('SELECT name FROM tracked_rooms').all().map((row) => row.name), ['Room']);
    assert.deepEqual(db.prepare('SELECT name FROM discovered_rooms').all().map((row) => row.name), ['Other']);
    assert.equal(detail(db, id).isFavorite, false);
    assert.deepEqual(page(db, 10, null, true), []);
  } finally {
    db.close();
  }
});

test('favorites survive room removal and can be unfavorited without registering the room again', () => {
  const db = createDatabase();
  try {
    register(db, ['Room']);
    const saved = insertMessage(db, 'Room', 100);
    const other = insertMessage(db, 'Room', 200);
    assert.equal(setFavorite(db, saved, true).isFavorite, true);
    assert.equal(page(db, 10).find((message) => message.id === saved).isFavorite, true);
    register(db, []);
    assert.deepEqual(page(db, 10), []);
    assert.deepEqual(page(db, 10, null, true).map((message) => message.id), [saved]);
    assert.equal(detail(db, saved).isFavorite, true);
    assert.equal(detail(db, other), null);
    assert.equal(setFavorite(db, saved, false).isFavorite, false);
    assert.equal(detail(db, saved), null);
    assert.deepEqual(page(db, 10, null, true), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 2);
  } finally {
    db.close();
  }
});

test('favorite changes reject hidden, missing, and unverified messages without changing stored history', () => {
  const db = createDatabase();
  try {
    register(db, ['Room']);
    const hidden = insertMessage(db, 'Hidden', 10);
    const unknown = insertMessage(db, 'Room', 20, 'unknown');
    const blank = insertMessage(db, '', 30);
    for (const id of [hidden, unknown, blank, 99999]) {
      assert.equal(detail(db, id), null);
      assert.throws(() => setFavorite(db, id, true), /missing or hidden/);
    }
    assert.equal(db.prepare('SELECT SUM(is_favorite) AS count FROM kakao_messages').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 3);
  } finally {
    db.close();
  }
});

test('favorite pagination filters before LIMIT and keeps timestamp ties stable across rooms', () => {
  const db = createDatabase();
  try {
    register(db, ['A', 'B']);
    const older = insertMessage(db, 'A', 100);
    insertMessage(db, 'A', 500);
    const firstTie = insertMessage(db, 'A', 300);
    const secondTie = insertMessage(db, 'B', 300);
    const newest = insertMessage(db, 'B', 400);
    for (const id of [older, firstTie, secondTie, newest]) setFavorite(db, id, true);
    register(db, []);
    assert.deepEqual(page(db, 2, null, true).map((message) => message.id), [newest, secondTie]);
    assert.deepEqual(page(db, 2, secondTie, true).map((message) => message.id), [firstTie, older]);
    // Removing a previous-page cursor must not skip the remaining page.
    setFavorite(db, secondTie, false);
    assert.deepEqual(page(db, 2, secondTie, true).map((message) => message.id), [firstTie, older]);
    assert.deepEqual(page(db, 2, older, true), []);
    assert.deepEqual(page(db, 2, 99999, true), []);
  } finally {
    db.close();
  }
});

test('duplicate notification inserts and metadata updates preserve the favorite and message identity', () => {
  const db = createDatabase();
  try {
    register(db, ['Room']);
    const id = insertMessage(db, 'Room', 100);
    setFavorite(db, id, true);
    const original = db.prepare('SELECT * FROM kakao_messages WHERE message_id = ?').get(id);
    assert.equal(db.prepare('INSERT OR IGNORE INTO kakao_messages(fingerprint,payload,timestamp,room,room_source) VALUES (?,?,?,?,?)')
      .run(original.fingerprint, original.payload, original.timestamp, original.room, original.room_source).changes, 0);
    const updatedPayload = { ...JSON.parse(original.payload), roomSource: 'conversationShortcut' };
    db.prepare('UPDATE kakao_messages SET payload = ?, room = ?, room_source = ? WHERE message_id = ?')
      .run(JSON.stringify(updatedPayload), original.room, updatedPayload.roomSource, id);
    const updated = detail(db, id);
    assert.equal(updated.isFavorite, true);
    assert.equal(updated.messageId, id);
    assert.equal(updated.roomSource, 'conversationShortcut');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 1);
    assert.equal(db.prepare('SELECT fingerprint FROM kakao_messages').get().fingerprint, original.fingerprint);
  } finally {
    db.close();
  }
});

test('clearing messages also clears favorites without reusing their IDs', () => {
  const db = createDatabase();
  try {
    register(db, ['Room']);
    const oldId = insertMessage(db, 'Room', 100);
    setFavorite(db, oldId, true);
    db.exec('DELETE FROM kakao_messages');
    assert.deepEqual(page(db, 10, null, true), []);
    assert.equal(detail(db, oldId), null);
    const newId = insertMessage(db, 'Room', 200);
    assert.ok(newId > oldId);
    assert.equal(detail(db, newId).isFavorite, false);
    assert.deepEqual(page(db, 10, oldId, true), []);
  } finally {
    db.close();
  }
});

test('discovery stores only unique names without enrolling rooms or raw notification contents', () => {
  const db = createDatabase();
  try {
    assert.deepEqual(db.prepare('PRAGMA table_info(discovered_rooms)').all().map((column) => column.name), ['name']);
    const discover = db.prepare('INSERT OR IGNORE INTO discovered_rooms(name) VALUES (?)');
    assert.equal(discover.run('공지방').changes, 1);
    assert.equal(discover.run('공지방').changes, 0);
    assert.equal(discover.run('Team').changes, 1);
    assert.equal(discover.run('team').changes, 1);
    assert.deepEqual(db.prepare('SELECT name FROM discovered_rooms ORDER BY name').all().map((row) => row.name),
      ['Team', 'team', '공지방']);
    for (const table of ['tracked_rooms', 'notifications', 'kakao_messages']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
    }
    const beforeRegistration = insertMessage(db, '공지방', 100);
    assert.deepEqual(page(db, 10), []);
    register(db, ['공지방']);
    assert.deepEqual(page(db, 10).map((row) => row.id), [beforeRegistration]);
    register(db, []);
    const afterRemoval = insertMessage(db, '공지방', 200);
    assert.deepEqual(page(db, 10), []);
    register(db, ['공지방']);
    assert.deepEqual(page(db, 10).map((row) => row.id), [afterRemoval, beforeRegistration]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM discovered_rooms').get().count, 3);
  } finally {
    db.close();
  }
});

test('v2 migration preserves raw/message history, IDs, and fingerprints', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(rawTable);
    db.exec(legacyMessageTable.replace(/,\s*room TEXT NOT NULL,\s*room_source TEXT NOT NULL\s*\)/, '\n)'));
    const payload = JSON.stringify({ room: '공지방', roomSource: 'conversationTitle', sender: 'Bob', msg: 'old', timestamp: 10 });
    db.prepare('INSERT INTO notifications(notification_key,post_time,fingerprint,payload,received_at) VALUES (?,?,?,?,?)')
      .run('legacy', 10, 'raw-original', '{"old":true}', 20);
    const id = db.prepare('INSERT INTO kakao_messages(fingerprint,payload,timestamp) VALUES (?,?,?)')
      .run('message-original', payload, 10).lastInsertRowid;
    db.exec('BEGIN');
    db.exec(trackedTable);
    db.exec(addRoomColumn);
    db.exec(addRoomSourceColumn);
    migrateVerifiedRooms(db);
    db.exec(roomIndex);
    db.exec(addFavoriteColumn);
    db.exec(favoriteIndex);
    db.exec('COMMIT');
    const old = db.prepare('SELECT * FROM kakao_messages WHERE message_id = ?').get(id);
    assert.equal(old.fingerprint, 'message-original');
    assert.equal(old.payload, payload);
    assert.equal(old.timestamp, 10);
    assert.equal(old.room, '공지방');
    assert.equal(old.room_source, 'conversationTitle');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 1);
    assert.deepEqual(page(db, 10), []);
    register(db, ['공지방']);
    assert.deepEqual(page(db, 10).map((row) => row.id), [id]);
  } finally {
    db.close();
  }
});

test('v3 migration invalidates inferred rooms, preserves verified history and registration', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(rawTable);
    db.exec(legacyMessageTable.replace(/,\s*room_source TEXT NOT NULL\s*\)/, '\n)'));
    db.exec(trackedTable);
    register(db, ['Bob', 'Team']);
    db.prepare('INSERT INTO notifications(notification_key,post_time,fingerprint,payload,received_at) VALUES (?,?,?,?,?)')
      .run('old-notification', 10, 'raw-kept', '{"text":"original"}', 20);
    const originals = [];
    for (const roomSource of [null, 'unknown', 'title', 'sender', 'subText', 'summaryText',
      'conversationTitle', 'hiddenConversationTitle', 'conversationShortcut']) {
      const room = verifiedSources.has(roomSource) ? 'Team' : 'Bob';
      const payload = { room, sender: 'Bob', msg: 'Original body', timestamp: 1234,
        notificationKey: 'original', isGroupChat: false, nested: { preserved: true } };
      if (roomSource !== null) payload.roomSource = roomSource;
      const fingerprint = `original-${originals.length}`;
      const id = db.prepare('INSERT INTO kakao_messages(fingerprint,payload,timestamp,room) VALUES (?,?,?,?)')
        .run(fingerprint, JSON.stringify(payload), payload.timestamp, room).lastInsertRowid;
      originals.push({ id, fingerprint, payload });
    }
    const malformedId = db.prepare('INSERT INTO kakao_messages(fingerprint,payload,timestamp,room) VALUES (?,?,?,?)')
      .run('malformed', '{broken-json', 2000, 'Bob').lastInsertRowid;
    db.exec('BEGIN');
    db.exec(addRoomSourceColumn);
    migrateVerifiedRooms(db);
    db.exec(addFavoriteColumn);
    db.exec(favoriteIndex);
    db.exec('COMMIT');
    for (const original of originals) {
      const row = db.prepare('SELECT * FROM kakao_messages WHERE message_id = ?').get(original.id);
      const payload = JSON.parse(row.payload);
      assert.equal(row.fingerprint, original.fingerprint);
      assert.equal(row.timestamp, original.payload.timestamp);
      if (verifiedSources.has(original.payload.roomSource)) {
        assert.equal(row.room, original.payload.room);
        assert.equal(row.room_source, original.payload.roomSource);
        assert.deepEqual(payload, original.payload);
      } else {
        assert.equal(row.room, '');
        assert.equal(row.room_source, 'unknown');
        assert.deepEqual(payload, { ...original.payload, room: '', roomSource: 'unknown' });
      }
    }
    const malformed = db.prepare('SELECT * FROM kakao_messages WHERE message_id = ?').get(malformedId);
    assert.equal(malformed.payload, '{broken-json');
    assert.equal(malformed.room, '');
    assert.equal(malformed.room_source, 'unknown');
    assert.deepEqual(db.prepare('SELECT name FROM tracked_rooms ORDER BY name').all().map((row) => row.name), ['Bob', 'Team']);
    assert.deepEqual(page(db, 20).map((row) => row.id), originals.slice(-3).reverse().map((row) => row.id));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 10);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 1);
  } finally {
    db.close();
  }
});

test('empty or removed registration hides records while preserving them', () => {
  const db = createDatabase();
  try {
    const id = insertMessage(db, '공지방', 10);
    assert.deepEqual(page(db, 10), []);
    register(db, ['공지방']);
    assert.deepEqual(page(db, 10).map((row) => row.id), [id]);
    register(db, []);
    assert.deepEqual(page(db, 10), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 1);
    register(db, ['공지방']);
    assert.deepEqual(page(db, 10).map((row) => row.id), [id]);
  } finally {
    db.close();
  }
});

test('JOIN matches the complete room name with case sensitivity', () => {
  const db = createDatabase();
  try {
    const expected = insertMessage(db, 'Team', 1);
    for (const room of ['team', 'My Team', 'Team announcements']) insertMessage(db, room, 10);
    register(db, ['Team']);
    assert.deepEqual(page(db, 10).map((row) => row.id), [expected]);
  } finally {
    db.close();
  }
});

test('matching registered names still excludes unknown, missing, and legacy room sources', () => {
  const db = createDatabase();
  try {
    register(db, ['Bob']);
    for (const roomSource of [null, 'unknown', 'title', 'sender', 'subText', 'summaryText']) {
      insertMessage(db, 'Bob', 20, roomSource);
    }
    insertMessage(db, '', 30, 'conversationTitle');
    assert.deepEqual(page(db, 10), []);
    const expected = insertMessage(db, 'Bob', 10, 'conversationShortcut');
    assert.deepEqual(page(db, 1).map((row) => row.id), [expected]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 8);
  } finally {
    db.close();
  }
});

test('registered-room filtering precedes LIMIT and uses timestamp/ID keyset pagination', () => {
  const db = createDatabase();
  try {
    const oldest = insertMessage(db, 'Team A', 100);
    insertMessage(db, 'Untracked', 900);
    const firstTie = insertMessage(db, 'Team A', 300);
    const middle = insertMessage(db, 'Team B', 200);
    const secondTie = insertMessage(db, 'Team A', 300);
    insertMessage(db, 'Untracked', 800);
    const newestTie = insertMessage(db, 'Team B', 300);
    register(db, ['Team A', 'Team B']);
    assert.deepEqual(page(db, 2).map((row) => row.id), [newestTie, secondTie]);
    assert.deepEqual(page(db, 2, secondTie).map((row) => row.id), [firstTie, middle]);
    assert.deepEqual(page(db, 2, middle).map((row) => row.id), [oldest]);
    assert.deepEqual(page(db, 2, oldest), []);
    assert.deepEqual(page(db, 2, 99999), []);
    register(db, ['Team A']);
    assert.deepEqual(page(db, 2, newestTie).map((row) => row.id), [secondTie, firstTie]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 7);
  } finally {
    db.close();
  }
});

test('verified metadata repairs an unknown room without replacing message identity', () => {
  const db = createDatabase();
  try {
    const id = insertMessage(db, '', 100, 'unknown');
    register(db, ['Team']);
    assert.deepEqual(page(db, 10), []);
    const original = db.prepare('SELECT * FROM kakao_messages WHERE message_id = ?').get(id);
    const stored = JSON.parse(original.payload);
    stored.room = 'Team';
    stored.roomSource = 'conversationTitle';
    assert.equal(db.prepare('UPDATE kakao_messages SET payload = ?, room = ?, room_source = ? WHERE message_id = ?')
      .run(JSON.stringify(stored), stored.room, stored.roomSource, id).changes, 1);
    assert.deepEqual(page(db, 10).map((row) => row.id), [id]);
    assert.equal(page(db, 10)[0].room, 'Team');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 1);
    const repaired = db.prepare('SELECT * FROM kakao_messages WHERE message_id = ?').get(id);
    assert.equal(repaired.fingerprint, original.fingerprint);
    assert.equal(repaired.timestamp, original.timestamp);
    assert.equal(page(db, 10)[0].sender, 'Bob');
  } finally {
    db.close();
  }
});

test('failed registration replacement rolls back the complete prior room list', () => {
  const db = createDatabase();
  try {
    insertMessage(db, 'Team A', 1);
    register(db, ['Team A']);
    assert.throws(() => register(db, ['Team B', 'Team B']), /UNIQUE constraint failed/);
    assert.deepEqual(db.prepare('SELECT name FROM tracked_rooms').all().map((row) => row.name), ['Team A']);
    assert.equal(page(db, 10).length, 1);
  } finally {
    db.close();
  }
});

test('failed derived-message insert rolls back its raw notification in the same transaction', () => {
  const db = createDatabase();
  try {
    register(db, ['Team']);
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO notifications(notification_key,post_time,fingerprint,payload,received_at) VALUES (?,?,?,?,?)')
        .run('new', 10, 'new-raw', '{}', 20);
      db.prepare('INSERT INTO kakao_messages(fingerprint,payload,timestamp,room,room_source) VALUES (?,?,?,?,?)')
        .run('invalid-message', '{}', 10, null, 'conversationTitle');
      assert.fail('The invalid message must fail');
    } catch (error) {
      db.exec('ROLLBACK');
      assert.match(error.message, /NOT NULL constraint failed/);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM kakao_messages').get().count, 0);
    assert.deepEqual(db.prepare('SELECT name FROM tracked_rooms').all().map((row) => row.name), ['Team']);
  } finally {
    db.close();
  }
});
