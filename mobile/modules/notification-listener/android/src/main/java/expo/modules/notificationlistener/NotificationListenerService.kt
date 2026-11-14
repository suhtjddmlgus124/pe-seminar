package expo.modules.notificationlistener

import android.app.Notification
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService.RankingMap
import android.service.notification.NotificationListenerService as AndroidNotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.CopyOnWriteArraySet

class NotificationListenerService : AndroidNotificationListenerService() {
  companion object {
    internal val observers = CopyOnWriteArraySet<(Map<String, Any?>) -> Unit>()
    internal val kakaoObservers = CopyOnWriteArraySet<(Map<String, Any?>) -> Unit>()
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  // Listener callbacks run on the main thread. Only changed shortcut metadata needs
  // another database pass when unrelated notification ranking updates arrive.
  private val collectedShortcuts = mutableMapOf<String, ConversationShortcutMetadata>()

  override fun onListenerConnected() {
    super.onListenerConnected()
    collectedShortcuts.clear()
    // Capture ranking once so reconnect collection uses a consistent snapshot.
    val rankingMap = try {
      currentRanking
    } catch (error: Exception) {
      Log.w("NotificationListener", "Unable to read current notification ranking", error)
      null
    }
    collectActiveNotifications(rankingMap, onlyChangedShortcuts = false)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification, rankingMap: RankingMap?) {
    if (sbn.packageName != "com.kakao.talk") return
    // Do not call super: its implementation delegates to the one-argument callback.
    collectNotification(sbn, NotificationRanking.conversationShortcut(sbn, rankingMap))
  }

  override fun onNotificationRankingUpdate(rankingMap: RankingMap?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || rankingMap == null) return
    collectActiveNotifications(rankingMap, onlyChangedShortcuts = true)
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    collectedShortcuts.remove(sbn.key)
  }

  override fun onListenerDisconnected() {
    collectedShortcuts.clear()
    super.onListenerDisconnected()
  }

  private fun collectActiveNotifications(rankingMap: RankingMap?, onlyChangedShortcuts: Boolean) {
    val active = try {
      activeNotifications ?: return
    } catch (error: Exception) {
      Log.e("NotificationListener", "Unable to read active notifications", error)
      return
    }
    val activeKakaoKeys = mutableSetOf<String>()
    for (sbn in active) {
      if (sbn.packageName != "com.kakao.talk") continue
      activeKakaoKeys.add(sbn.key)
      val shortcut = NotificationRanking.conversationShortcut(sbn, rankingMap)
      if (!onlyChangedShortcuts || (shortcut != null && shortcut != collectedShortcuts[sbn.key])) {
        collectNotification(sbn, shortcut)
      }
    }
    collectedShortcuts.keys.retainAll(activeKakaoKeys)
  }

  private fun collectNotification(sbn: StatusBarNotification, shortcut: ConversationShortcutMetadata?) {
    if (sbn.packageName != "com.kakao.talk") return
    try {
      enqueueNotification(sbn, shortcut)
      if (shortcut == null) collectedShortcuts.remove(sbn.key) else collectedShortcuts[sbn.key] = shortcut
    } catch (error: Exception) {
      Log.e("NotificationListener", "Unable to read a notification", error)
    }
  }

  private fun enqueueNotification(sbn: StatusBarNotification, shortcut: ConversationShortcutMetadata?) {
    val receivedAt = System.currentTimeMillis()
    val notification = sbn.notification
    val extras = notification.extras
    val rawExtras = NotificationExtras.toMap(extras)
    val conversationTitle = rawExtras[Notification.EXTRA_CONVERSATION_TITLE] as? String
    // AndroidX keeps the title here when it is hidden from the notification header.
    val hiddenConversationTitle = rawExtras["android.hiddenConversationTitle"] as? String
    val payload = mapOf<String, Any?>(
      "key" to sbn.key,
      "packageName" to sbn.packageName,
      "id" to sbn.id,
      "tag" to sbn.tag,
      "postTime" to sbn.postTime,
      "notificationTimestamp" to notification.`when`,
      "channelId" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) notification.channelId else null,
      "shortcutId" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) notification.shortcutId else null,
      "groupKey" to sbn.groupKey,
      "category" to notification.category,
      "isOngoing" to sbn.isOngoing,
      "title" to (rawExtras[Notification.EXTRA_TITLE] as? String),
      "text" to (rawExtras[Notification.EXTRA_TEXT] as? String),
      "bigText" to (rawExtras[Notification.EXTRA_BIG_TEXT] as? String),
      "subText" to (rawExtras[Notification.EXTRA_SUB_TEXT] as? String),
      "textLines" to ((rawExtras[Notification.EXTRA_TEXT_LINES] as? List<*>)
        ?.filterIsInstance<String>() ?: emptyList<String>()),
      "isGroupSummary" to ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0),
      "conversationTitle" to conversationTitle,
      "hiddenConversationTitle" to hiddenConversationTitle,
      "conversationShortcut" to shortcut?.toMap(),
      "extras" to rawExtras
    )

    val application = applicationContext
    NotificationStore.executor.execute {
      try {
        val (stored, messages) = NotificationStore.getInstance(application)
          .insertNotificationWithMessages(payload, receivedAt)
        // Persist first; UI subscribers are optional and never own the collection lifecycle.
        if (stored != null || messages.isNotEmpty()) {
          mainHandler.post {
            if (stored != null) observers.forEach { it(stored) }
            messages.forEach { message -> kakaoObservers.forEach { it(message) } }
          }
        }
      } catch (error: Exception) {
        Log.e("NotificationListener", "Unable to store a notification", error)
      }
    }
  }
}
