package expo.modules.notificationlistener

import android.app.Notification
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService as AndroidNotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.CopyOnWriteArraySet

class NotificationListenerService : AndroidNotificationListenerService() {
  companion object {
    internal val observers = CopyOnWriteArraySet<(Map<String, Any?>) -> Unit>()
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onListenerConnected() {
    super.onListenerConnected()
    // Only query active notifications after Android has connected the listener.
    try {
      activeNotifications?.forEach { collectNotification(it) }
    } catch (error: SecurityException) {
      Log.e("NotificationListener", "Unable to read active notifications", error)
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    collectNotification(sbn)
  }

  private fun collectNotification(sbn: StatusBarNotification) {
    val receivedAt = System.currentTimeMillis()
    val notification = sbn.notification
    val extras = notification.extras
    val payload = mapOf<String, Any?>(
      "key" to sbn.key,
      "packageName" to sbn.packageName,
      "id" to sbn.id,
      "postTime" to sbn.postTime,
      "channelId" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) notification.channelId else null,
      "groupKey" to sbn.groupKey,
      "category" to notification.category,
      "isOngoing" to sbn.isOngoing,
      "title" to extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
      "text" to extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
      "bigText" to extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
      "subText" to extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
      "textLines" to (extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        ?.map { it.toString() } ?: emptyList<String>()),
      "isGroupSummary" to ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0)
    )

    val application = applicationContext
    NotificationStore.executor.execute {
      try {
        val stored = NotificationStore.getInstance(application).insert(payload, receivedAt)
          ?: return@execute
        // Persist first; UI subscribers are optional and never own the collection lifecycle.
        mainHandler.post { observers.forEach { it(stored) } }
      } catch (error: Exception) {
        Log.e("NotificationListener", "Unable to store a notification", error)
      }
    }
  }
}
