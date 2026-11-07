package expo.modules.notificationlistener

/** Immutable, JSON-safe shortcut data after its notification identity has been checked. */
internal data class ConversationShortcutMetadata(
  val id: String,
  val packageName: String,
  val longLabel: String?,
  val shortLabel: String?
) {
  fun matchesNotification(
    notificationKey: String,
    notificationPackageName: String,
    notificationShortcutId: String?,
    rankingKey: String?
  ): Boolean = notificationKey.isNotBlank() && rankingKey == notificationKey &&
    notificationPackageName.isNotBlank() && packageName == notificationPackageName &&
    id.isNotBlank() && (notificationShortcutId.isNullOrBlank() || id == notificationShortcutId)

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "longLabel" to longLabel,
    "shortLabel" to shortLabel
  )
}
