package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.Executors

internal class NotificationStore private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "collected-notifications.db", null, 4) {
  companion object {
    private const val VERIFIED_ROOM_SELECTION =
      "messages.room <> '' AND messages.room_source IN ('conversationShortcut', 'conversationTitle', 'hiddenConversationTitle')"
    private const val KAKAO_CURSOR_SELECTION =
      "messages.timestamp < ? OR (messages.timestamp = ? AND messages.message_id < ?)"

    // Service writes and JS reads share a queue, including when no React runtime exists.
    val executor = Executors.newSingleThreadExecutor()

    @Volatile private var instance: NotificationStore? = null

    fun getInstance(context: Context): NotificationStore =
      instance ?: synchronized(this) {
        instance ?: NotificationStore(context).also { instance = it }
      }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE notifications (
        collection_id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_key TEXT NOT NULL,
        post_time INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        payload TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        UNIQUE(notification_key, post_time, fingerprint)
      )
      """.trimIndent()
    )
    createKakaoMessagesTable(db)
    createTrackedRoomsTable(db)
    createKakaoMessagesRoomIndex(db)
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      createKakaoMessagesTable(db)
    }
    if (oldVersion < 3) {
      createTrackedRoomsTable(db)
      if (oldVersion >= 2) {
        db.execSQL("ALTER TABLE kakao_messages ADD COLUMN room TEXT NOT NULL DEFAULT ''")
      }
      createKakaoMessagesRoomIndex(db)
    }
    if (oldVersion < 4) {
      if (oldVersion >= 2) {
        db.execSQL("ALTER TABLE kakao_messages ADD COLUMN room_source TEXT NOT NULL DEFAULT 'unknown'")
      }
      migrateVerifiedMessageRooms(db)
    }
    if (oldVersion < 2) {
      backfillKakaoMessages(db)
    }
  }

  private fun createKakaoMessagesTable(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS kakao_messages (
        message_id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        room TEXT NOT NULL,
        room_source TEXT NOT NULL
      )
      """.trimIndent()
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS kakao_messages_timestamp_id " +
        "ON kakao_messages(timestamp DESC, message_id DESC)"
    )
  }

  private fun createTrackedRoomsTable(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE IF NOT EXISTS tracked_rooms (name TEXT PRIMARY KEY NOT NULL)")
  }

  private fun createKakaoMessagesRoomIndex(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS kakao_messages_room_timestamp_id " +
        "ON kakao_messages(room, timestamp DESC, message_id DESC)"
    )
  }

  private fun migrateVerifiedMessageRooms(db: SQLiteDatabase) {
    db.query(
      "kakao_messages", arrayOf("message_id", "payload"),
      null, null, null, null, "message_id ASC"
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getLong(0)
        val json = cursor.getString(1)
        val payload = try {
          decodePayload(json).also { TrackedRooms.sanitizeStoredMessageRoom(it) }
        } catch (error: Exception) {
          Log.w("NotificationListener", "Skipping invalid Kakao message $id during room migration")
          null
        }
        val values = ContentValues().apply {
          put("room", (payload?.get("room") as? String).orEmpty())
          put("room_source", payload?.get("roomSource") as? String ?: "unknown")
          // Retain malformed payloads intact while hiding their unverified room columns.
          if (payload != null) put("payload", JSONObject(payload).toString())
        }
        db.update("kakao_messages", values, "message_id = ?", arrayOf(id.toString()))
      }
    }
  }

  fun getTrackedRooms(): List<String> = getTrackedRooms(readableDatabase)

  private fun getTrackedRooms(db: SQLiteDatabase): List<String> = db.query(
    "tracked_rooms", arrayOf("name"), null, null, null, null, null
  ).use { cursor ->
    TrackedRooms.normalize(buildList {
      while (cursor.moveToNext()) add(cursor.getString(0))
    })
  }

  fun setTrackedRooms(rooms: List<String>): List<String> {
    val normalized = TrackedRooms.normalize(rooms)
    val db = writableDatabase
    db.beginTransaction()
    try {
      db.delete("tracked_rooms", null, null)
      for (room in normalized) {
        db.insertOrThrow("tracked_rooms", null, ContentValues().apply { put("name", room) })
      }
      db.setTransactionSuccessful()
      return normalized
    } finally {
      db.endTransaction()
    }
  }

  fun insert(payload: Map<String, Any?>, receivedAt: Long): Map<String, Any?>? {
    val json = JSONObject(payload).toString()
    val fingerprint = MessageDigest.getInstance("SHA-256")
      .digest(json.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
    val values = ContentValues().apply {
      put("notification_key", payload["key"] as String)
      put("post_time", payload["postTime"] as Long)
      put("fingerprint", fingerprint)
      put("payload", json)
      put("received_at", receivedAt)
    }
    val id = writableDatabase.insertWithOnConflict(
      "notifications", null, values, SQLiteDatabase.CONFLICT_IGNORE
    )
    // Reconnecting must not duplicate unchanged active notifications. Changed content
    // with the same Android key and timestamp remains a separate collection record.
    if (id == -1L) return null
    return payload + mapOf("collectionId" to id, "receivedAt" to receivedAt)
  }

  fun insertNotificationWithMessages(
    payload: Map<String, Any?>,
    receivedAt: Long
  ): Pair<Map<String, Any?>?, List<Map<String, Any?>>> {
    val db = writableDatabase
    db.beginTransaction()
    try {
      val rooms = getTrackedRooms(db).toSet()
      val matched = if (rooms.isEmpty()) emptyList() else KakaoMessageParser.parse(payload)
        .filter { TrackedRooms.matches(it.room, rooms, it.roomSource) }
      if (matched.isEmpty()) {
        db.setTransactionSuccessful()
        return null to emptyList()
      }
      val notification = insert(payload, receivedAt)
      // Parse duplicate raw notifications too, so missing derived rows can be restored.
      val messages = insertKakaoMessages(db, matched)
      db.setTransactionSuccessful()
      return notification to messages
    } finally {
      db.endTransaction()
    }
  }

  fun getNotifications(limit: Int, beforeId: Long?): List<Map<String, Any?>> {
    require(limit in 1..500) { "limit must be between 1 and 500" }
    require(beforeId == null || beforeId > 0) { "beforeId must be positive" }
    val selection = if (beforeId != null) "collection_id < ?" else null
    val args = beforeId?.let { arrayOf(it.toString()) }
    return readableDatabase.query(
      "notifications", arrayOf("collection_id", "payload", "received_at"),
      selection, args, null, null, "collection_id DESC", limit.toString()
    ).use { cursor ->
      buildList {
        while (cursor.moveToNext()) {
          val payload = decodePayload(cursor.getString(1))
          payload["collectionId"] = cursor.getLong(0)
          payload["receivedAt"] = cursor.getLong(2)
          add(payload)
        }
      }
    }
  }

  fun insertKakaoMessages(messages: List<ParsedKakaoMessage>): List<Map<String, Any?>> {
    if (messages.isEmpty()) return emptyList()
    val db = writableDatabase
    db.beginTransaction()
    try {
      val inserted = insertKakaoMessages(db, messages)
      db.setTransactionSuccessful()
      return inserted
    } finally {
      db.endTransaction()
    }
  }

  private fun insertKakaoMessages(
    db: SQLiteDatabase,
    messages: List<ParsedKakaoMessage>
  ): List<Map<String, Any?>> = buildList {
    val rooms = getTrackedRooms(db).toSet()
    for (message in messages) {
      if (!TrackedRooms.matches(message.room, rooms, message.roomSource)) continue
      // Include message time so identical text sent later remains a separate message.
      // Preserve the count of indistinguishable messages visible in one notification batch.
      val identity = JSONArray(
        listOf(
          message.conversationKey, message.sender, message.msg, message.timestamp, message.occurrence
        )
      ).toString()
      val fingerprint = MessageDigest.getInstance("SHA-256")
        .digest(identity.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
      val payload = message.toMap()
      val values = ContentValues().apply {
        put("fingerprint", fingerprint)
        put("payload", JSONObject(payload).toString())
        put("timestamp", message.timestamp)
        put("room", message.room)
        put("room_source", message.roomSource)
      }
      val id = db.insertWithOnConflict(
        "kakao_messages", null, values, SQLiteDatabase.CONFLICT_IGNORE
      )
      if (id != -1L) {
        add(payload + mapOf("messageId" to id))
      } else {
        upgradeKakaoMessageMetadata(db, fingerprint, payload)?.let { updated ->
          val room = updated["room"] as? String
          if (room != null && TrackedRooms.matches(room, rooms, updated["roomSource"] as? String)) {
            add(updated)
          }
        }
      }
    }
  }

  private fun upgradeKakaoMessageMetadata(
    db: SQLiteDatabase,
    fingerprint: String,
    candidate: Map<String, Any?>
  ): Map<String, Any?>? = db.query(
    "kakao_messages", arrayOf("message_id", "payload"), "fingerprint = ?",
    arrayOf(fingerprint), null, null, null, "1"
  ).use { cursor ->
    if (!cursor.moveToFirst()) return@use null
    val id = cursor.getLong(0)
    val stored = decodePayload(cursor.getString(1))
    var changed = false
    if (TrackedRooms.shouldUpdateRoom(
      stored["room"] as? String, stored["roomSource"] as? String,
      candidate["room"] as? String, candidate["roomSource"] as? String
    )) {
      stored["room"] = candidate["room"]
      stored["roomSource"] = candidate["roomSource"]
      if (stored["isGroupChatSource"] == "inferred") {
        stored["isGroupChat"] = stored["room"] != stored["sender"]
      }
      changed = true
    }
    if (candidate["isGroupChatSource"] == "notification" &&
      stored["isGroupChatSource"] != "notification") {
      stored["isGroupChat"] = candidate["isGroupChat"]
      stored["isGroupChatSource"] = candidate["isGroupChatSource"]
      changed = true
    }
    if (candidate["timestampSource"] == "message" && stored["timestampSource"] != "message") {
      stored["timestampSource"] = candidate["timestampSource"]
      changed = true
    }
    if (!changed) return@use null
    // Upgrade provenance without changing message identity, ordering, or pagination IDs.
    val values = ContentValues().apply {
      put("payload", JSONObject(stored).toString())
      put("room", stored["room"] as String)
      put("room_source", stored["roomSource"] as? String ?: "unknown")
    }
    check(db.update("kakao_messages", values, "message_id = ?", arrayOf(id.toString())) == 1) {
      "Unable to update stored Kakao message metadata"
    }
    stored + mapOf("messageId" to id)
  }

  fun getKakaoMessages(limit: Int, beforeId: Long?): List<Map<String, Any?>> {
    require(limit in 1..500) { "limit must be between 1 and 500" }
    require(beforeId == null || beforeId > 0) { "beforeId must be positive" }
    val db = readableDatabase
    val beforeTimestamp = if (beforeId == null) null else db.query(
      "kakao_messages", arrayOf("timestamp"), "message_id = ?",
      arrayOf(beforeId.toString()), null, null, null, "1"
    ).use { cursor ->
      if (cursor.moveToFirst()) cursor.getLong(0) else return emptyList()
    }
    val selection = if (beforeId == null) VERIFIED_ROOM_SELECTION else
      "$VERIFIED_ROOM_SELECTION AND ($KAKAO_CURSOR_SELECTION)"
    val args = beforeTimestamp?.let {
      arrayOf(it.toString(), it.toString(), beforeId.toString())
    }
    return db.query(
      "kakao_messages AS messages INNER JOIN tracked_rooms AS tracked ON messages.room = tracked.name",
      arrayOf("messages.message_id", "messages.payload"),
      selection, args, null, null,
      "messages.timestamp DESC, messages.message_id DESC", limit.toString()
    ).use { cursor ->
      buildList {
        while (cursor.moveToNext()) {
          val payload = decodePayload(cursor.getString(1))
          payload["messageId"] = cursor.getLong(0)
          add(payload)
        }
      }
    }
  }

  fun clearKakaoMessages() {
    // Retain increasing IDs so cleared pagination cursors cannot address new rows.
    writableDatabase.delete("kakao_messages", null, null)
  }

  fun backfillKakaoMessages() {
    val db = writableDatabase
    db.beginTransaction()
    try {
      backfillKakaoMessages(db)
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  private fun backfillKakaoMessages(db: SQLiteDatabase) {
    if (getTrackedRooms(db).isEmpty()) return
    db.query(
      "notifications", arrayOf("collection_id", "payload", "received_at"),
      null, null, null, null, "collection_id ASC"
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val collectionId = cursor.getLong(0)
        val json = cursor.getString(1)
        val receivedAt = cursor.getLong(2)
        val messages = try {
          val payload = decodePayload(json)
          payload["collectionId"] = collectionId
          payload["receivedAt"] = receivedAt
          KakaoMessageParser.parse(payload)
        } catch (error: Exception) {
          // A malformed legacy row must not prevent access to the intact raw history.
          Log.w(
            "NotificationListener",
            "Skipping invalid notification $collectionId during Kakao backfill " +
              "(${error.javaClass.simpleName})"
          )
          continue
        }
        // Database errors propagate so SQLiteOpenHelper rolls back a failed migration.
        insertKakaoMessages(db, messages)
      }
    }
  }

  private fun decodePayload(json: String): MutableMap<String, Any?> {
    val objectValue = JSONObject(json)
    return mutableMapOf<String, Any?>().apply {
      objectValue.keys().forEach { key -> put(key, decodeJsonValue(objectValue.get(key))) }
    }
  }

  private fun decodeJsonValue(value: Any?): Any? = when (value) {
    JSONObject.NULL -> null
    is JSONObject -> buildMap<String, Any?> {
      value.keys().forEach { key -> put(key, decodeJsonValue(value.get(key))) }
    }
    is JSONArray -> List(value.length()) { decodeJsonValue(value.get(it)) }
    else -> value
  }

  fun clear() {
    // Keep the autoincrement sequence so old pagination cursors cannot be reused.
    writableDatabase.delete("notifications", null, null)
  }
}
