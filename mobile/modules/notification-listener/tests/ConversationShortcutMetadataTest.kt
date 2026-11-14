package expo.modules.notificationlistener

/** Standalone JVM checks; compile together with ConversationShortcutMetadata.kt. */
fun main() {
  val shortcut = ConversationShortcutMetadata("room-id", "com.kakao.talk", "Room", "Short")
  check(shortcut.matchesNotification("key", "com.kakao.talk", "room-id", "key"))
  check(!shortcut.matchesNotification("key", "com.kakao.talk", "room-id", "another-key"))
  check(!shortcut.matchesNotification("key", "another.package", "room-id", "key"))
  check(!shortcut.matchesNotification("key", "com.kakao.talk", "another-id", "key"))
  check(shortcut.matchesNotification("key", "com.kakao.talk", null, "key"))
  check(shortcut.matchesNotification("key", "com.kakao.talk", "", "key"))
  check(shortcut.matchesNotification("key", "com.kakao.talk", " ", "key"))
  check(!shortcut.matchesNotification("key", "com.kakao.talk", "room-id", null))
  check(!shortcut.matchesNotification("", "com.kakao.talk", "room-id", ""))
  check(!shortcut.matchesNotification("key", "com.kakao.talk", " room-id ", "key"))
  check(!shortcut.copy(id = "").matchesNotification("key", "com.kakao.talk", null, "key"))
  check(!shortcut.copy(id = " ").matchesNotification("key", "com.kakao.talk", null, "key"))
  check(shortcut.toMap() == mapOf(
    "id" to "room-id", "packageName" to "com.kakao.talk",
    "longLabel" to "Room", "shortLabel" to "Short"
  ))
  val emptyLabels = shortcut.copy(longLabel = null, shortLabel = "")
  check(emptyLabels.toMap()["longLabel"] == null)
  check(emptyLabels.toMap()["shortLabel"] == "")
  check(shortcut == shortcut.copy())
  check(shortcut != shortcut.copy(longLabel = "Renamed"))
  println("17 conversation shortcut metadata checks passed")
}
