package expo.modules.notificationlistener

import android.os.Build
import android.service.notification.NotificationListenerService.Ranking
import android.service.notification.NotificationListenerService.RankingMap
import android.service.notification.StatusBarNotification

/** Ranking data can arrive after the notification and may be absent from partial maps. */
internal object NotificationRanking {
  fun conversationShortcut(
    sbn: StatusBarNotification,
    rankingMap: RankingMap?
  ): ConversationShortcutMetadata? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || rankingMap == null) return null
    return try {
      val ranking = Ranking()
      if (!rankingMap.getRanking(sbn.key, ranking)) return null
      val shortcut = ranking.conversationShortcutInfo ?: return null
      val metadata = ConversationShortcutMetadata(
        id = shortcut.id,
        packageName = shortcut.`package`,
        longLabel = shortcut.longLabel?.toString(),
        shortLabel = shortcut.shortLabel?.toString()
      )
      metadata.takeIf {
        it.matchesNotification(sbn.key, sbn.packageName, sbn.notification.shortcutId, ranking.key)
      }
    } catch (_: Exception) {
      // Missing, inaccessible or malformed ranking metadata must not stop collection.
      null
    }
  }
}
