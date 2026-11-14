package expo.modules.notificationlistener

/** Message values and their provenance, independent of Android notification classes. */
internal data class ParsedKakaoMessage(
  val room: String,
  val sender: String,
  val msg: String,
  val isGroupChat: Boolean,
  val timestamp: Long,
  val timestampSource: String,
  val roomSource: String,
  val isGroupChatSource: String,
  val notificationKey: String,
  val conversationKey: String,
  val occurrence: Int = 0
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "room" to room,
    "sender" to sender,
    "msg" to msg,
    "isGroupChat" to isGroupChat,
    "timestamp" to timestamp,
    "timestampSource" to timestampSource,
    "roomSource" to roomSource,
    "isGroupChatSource" to isGroupChatSource,
    "notificationKey" to notificationKey
  )
}

/** Parses normalized notification extras; it never guesses a timestamp or a verified room. */
internal object KakaoMessageParser {
  fun parse(payload: Map<String, Any?>): List<ParsedKakaoMessage> {
    if (payload["packageName"] != "com.kakao.talk" || payload["isGroupSummary"] == true) {
      return emptyList()
    }

    val extras = payload["extras"] as? Map<*, *> ?: emptyMap<Any?, Any?>()
    fun field(fieldName: String): String? = name(payload[fieldName]) ?: name(extras["android.$fieldName"])
    fun bodyField(fieldName: String): String? = body(payload[fieldName]) ?: body(extras["android.$fieldName"])

    val title = field("title")
    val shortcut = payload["conversationShortcut"] as? Map<*, *>
    val shortcutLabel = name(shortcut?.get("longLabel")) ?: name(shortcut?.get("shortLabel"))
    // The system conversation shortcut can override MessagingStyle's displayed title.
    // Sender names and generic notification text are never evidence of a room name.
    val roomCandidate = listOf(
      "conversationShortcut" to shortcutLabel,
      "conversationTitle" to field("conversationTitle"),
      "hiddenConversationTitle" to field("hiddenConversationTitle")
    ).firstOrNull { it.second != null }
    val room = roomCandidate?.second.orEmpty()
    val roomSource = roomCandidate?.first ?: "unknown"
    val explicitGroup = extras["android.isGroupConversation"] as? Boolean
      ?: payload["isGroupConversation"] as? Boolean
    val notificationTime = positiveTime(payload["notificationTimestamp"])
      ?: positiveTime(payload["postTime"])
    val notificationKey = name(payload["key"]).orEmpty()
    val shortcutId = name(payload["shortcutId"]) ?: name(shortcut?.get("id"))
    val conversationKey = shortcutId?.let { "shortcut:$it" }
      ?: name(payload["tag"])?.let { "tag:$it" }
      ?: "notification:$notificationKey"

    val messageBundles = (extras["android.messages"] as? List<*>)
      .orEmpty()
      .mapNotNull { it as? Map<*, *> }
      .filter { body(it["text"]) != null || body(it["android.text"]) != null }
    // A MessagingStyle notification can repeat several historical messages.
    // Keep every valid message in order; persistence owns replay deduplication.
    val candidates: List<Map<*, *>?> = if (messageBundles.isEmpty()) listOf(null) else messageBundles
    val occurrences = mutableMapOf<List<Any>, Int>()

    return candidates.mapNotNull { message ->
      val msg = if (message != null) {
        body(message["text"]) ?: body(message["android.text"])
      } else {
        bodyField("text") ?: bodyField("bigText")
      } ?: return@mapNotNull null
      val person = message?.get("sender_person") as? Map<*, *>
      val explicitSender = name(person?.get("name"))
        ?: name(message?.get("sender"))
        ?: name(message?.get("android.title"))
      val sender = explicitSender ?: title ?: "알 수 없음"
      val messageTime = positiveTime(message?.get("time"))
      val timestamp = messageTime ?: notificationTime ?: return@mapNotNull null
      // Preserve identical entries in one batch while a full batch replay uses the same ordinals.
      val identity = listOf(conversationKey, sender, msg, timestamp)
      val occurrence = occurrences[identity] ?: 0
      occurrences[identity] = occurrence + 1
      ParsedKakaoMessage(
        room = room,
        sender = sender,
        msg = msg,
        isGroupChat = explicitGroup ?: (room.isNotEmpty() && room != sender),
        timestamp = timestamp,
        timestampSource = if (messageTime != null) "message" else "notification",
        roomSource = roomSource,
        isGroupChatSource = if (explicitGroup != null) "notification" else "inferred",
        notificationKey = notificationKey,
        conversationKey = conversationKey,
        occurrence = occurrence
      )
    }
  }

  private fun name(value: Any?): String? =
    (value as? CharSequence)?.toString()?.trim()?.takeIf { it.isNotEmpty() }

  private fun body(value: Any?): String? =
    (value as? CharSequence)?.toString()?.takeIf { it.isNotBlank() }

  private fun positiveTime(value: Any?): Long? {
    if (value !is Number || !value.toDouble().isFinite()) return null
    return value.toLong().takeIf { it > 0 }
  }
}
