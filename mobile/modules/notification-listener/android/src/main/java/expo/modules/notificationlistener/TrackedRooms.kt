package expo.modules.notificationlistener

/** Room names use exact, case-sensitive matching after registration input is normalized. */
internal object TrackedRooms {
  fun normalize(rooms: List<String>): List<String> = rooms
    .map { it.trim() }
    .filter { it.isNotEmpty() }
    .distinct()
    .sorted()

  fun sourceRank(source: String?): Int = when (source) {
    "conversationShortcut" -> 0
    "conversationTitle" -> 1
    "hiddenConversationTitle" -> 2
    else -> Int.MAX_VALUE
  }

  fun isVerifiedSource(source: String?): Boolean = sourceRank(source) != Int.MAX_VALUE

  fun matches(room: String, rooms: Set<String>, roomSource: String?): Boolean =
    room.isNotBlank() && isVerifiedSource(roomSource) && room in rooms

  fun shouldUpdateRoom(
    storedRoom: String?,
    storedSource: String?,
    candidateRoom: String?,
    candidateSource: String?
  ): Boolean {
    if (candidateRoom.isNullOrBlank() || !isVerifiedSource(candidateSource)) return false
    return sourceRank(candidateSource) < sourceRank(storedSource) ||
      (candidateSource == storedSource && candidateRoom != storedRoom)
  }

  fun sanitizeStoredMessageRoom(payload: MutableMap<String, Any?>) {
    if ((payload["room"] as? String).isNullOrBlank() ||
      !isVerifiedSource(payload["roomSource"] as? String)) {
      payload["room"] = ""
      payload["roomSource"] = "unknown"
    }
  }
}
