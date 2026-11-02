package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.Executors

internal class NotificationStore private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "collected-notifications.db", null, 1) {
  companion object {
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
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // Version 1 is the initial schema. Add migrations here before increasing the version.
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
          val json = JSONObject(cursor.getString(1))
          val payload = mutableMapOf<String, Any?>()
          json.keys().forEach { key ->
            payload[key] = when (val value = json.get(key)) {
              JSONObject.NULL -> null
              is JSONArray -> List(value.length()) { value.getString(it) }
              else -> value
            }
          }
          payload["collectionId"] = cursor.getLong(0)
          payload["receivedAt"] = cursor.getLong(2)
          add(payload)
        }
      }
    }
  }

  fun clear() {
    // Keep the autoincrement sequence so old pagination cursors cannot be reused.
    writableDatabase.delete("notifications", null, null)
  }
}
