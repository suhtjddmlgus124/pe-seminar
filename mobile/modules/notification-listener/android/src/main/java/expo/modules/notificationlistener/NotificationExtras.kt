package expo.modules.notificationlistener

import android.app.Person
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SparseArray

/** Converts notification extras to stable JSON values without serializing binary parcelables. */
internal object NotificationExtras {
  private const val MAX_DEPTH = 8

  fun toMap(bundle: Bundle): Map<String, Any?> = readBundle(bundle, 0)

  @Suppress("DEPRECATION")
  private fun readBundle(bundle: Bundle, depth: Int): Map<String, Any?> {
    val keys = try {
      bundle.keySet().sorted()
    } catch (_: Exception) {
      return marker(bundle, "unreadable")
    }
    return keys.associateWith { key ->
      try {
        toJsonValue(bundle.get(key), depth + 1)
      } catch (_: Exception) {
        mapOf("_type" to "unreadable", "_reason" to "unreadable")
      }
    }
  }

  private fun toJsonValue(value: Any?, depth: Int): Any? {
    if (value == null) return null
    if (depth > MAX_DEPTH) return marker(value, "max_depth")
    return when (value) {
      is CharSequence -> value.toString()
      is Char -> value.toString()
      is Boolean, is Byte, is Short, is Int, is Long -> value
      is Double -> if (value.isFinite()) value else marker(value, "non_finite")
      is Float -> if (value.isFinite()) value else marker(value, "non_finite")
      is Bundle -> readBundle(value, depth)
      is Uri -> value.toString()
      is Array<*> -> value.map { toJsonValue(it, depth + 1) }
      is Collection<*> -> value.map { toJsonValue(it, depth + 1) }
      is Map<*, *> -> if (value.keys.all { it is String }) {
        value.entries.sortedBy { it.key as String }.associate {
          (it.key as String) to toJsonValue(it.value, depth + 1)
        }
      } else {
        marker(value, "unsupported_keys")
      }
      is SparseArray<*> -> (0 until value.size()).associate {
        value.keyAt(it).toString() to toJsonValue(value.valueAt(it), depth + 1)
      }
      is BooleanArray -> value.toList()
      is ShortArray -> value.toList()
      is IntArray -> value.toList()
      is LongArray -> value.toList()
      is FloatArray -> value.map { toJsonValue(it, depth + 1) }
      is DoubleArray -> value.map { toJsonValue(it, depth + 1) }
      is CharArray -> value.map { it.toString() }
      is ByteArray -> marker(value, "binary") + mapOf("_length" to value.size)
      else -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && value is Person) {
          mapOf(
            "_type" to "android.app.Person",
            "name" to value.name?.toString(),
            "key" to value.key,
            "uri" to value.uri,
            "isBot" to value.isBot,
            "isImportant" to value.isImportant
          )
        } else {
          // Bitmap, Icon, PendingIntent, etc. must not become opaque objects or
          // identity-dependent toString() values in the JS bridge or database.
          marker(value, "unsupported")
        }
      }
    }
  }

  private fun marker(value: Any, reason: String): Map<String, Any?> =
    mapOf("_type" to value.javaClass.name, "_reason" to reason)
}
