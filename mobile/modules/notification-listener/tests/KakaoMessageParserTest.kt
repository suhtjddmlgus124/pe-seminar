package expo.modules.notificationlistener

/**
 * Self-contained JVM tests, with no Android SDK or test dependency:
 * kotlinc android/src/main/java/expo/modules/notificationlistener/KakaoMessageParser.kt \
 *   tests/KakaoMessageParserTest.kt -include-runtime -d parser-tests.jar
 * java -jar parser-tests.jar
 */
fun main() {
  var passed = 0
  fun test(label: String, block: () -> Unit) {
    try {
      block()
      passed += 1
    } catch (error: Throwable) {
      throw AssertionError("Failed: $label", error)
    }
  }

  test("filters other packages and group summaries") {
    equal(emptyList<ParsedKakaoMessage>(), parse("packageName" to "org.example"))
    equal(emptyList<ParsedKakaoMessage>(), parse("isGroupSummary" to true))
  }
  test("room discovery works without a visible message body or timestamp") {
    val payload = mapOf<String, Any?>(
      "packageName" to "com.kakao.talk",
      "conversationTitle" to "  공지방  "
    )
    equal("공지방" to "conversationTitle", KakaoMessageParser.resolveRoom(payload))
    equal(emptyList<ParsedKakaoMessage>(), KakaoMessageParser.parse(payload))
  }
  test("room discovery excludes other apps and summary notifications even with a room title") {
    for (overrides in listOf(
      mapOf("packageName" to "org.example"), mapOf("isGroupSummary" to true)
    )) {
      equal(null, KakaoMessageParser.resolveRoom(base() + mapOf("conversationTitle" to "Room") + overrides))
    }
  }
  test("room discovery never substitutes a sender or generic notification field") {
    equal(null, KakaoMessageParser.resolveRoom(base() + mapOf(
      "subText" to "Subtext", "summaryText" to "Summary", "groupKey" to "Group key",
      "extras" to mapOf("android.messages" to listOf(mapOf("sender" to "Bob", "text" to "Body")))
    )))
    equal(null, KakaoMessageParser.resolveRoom(base() + mapOf(
      "conversationTitle" to " ", "hiddenConversationTitle" to 42,
      "conversationShortcut" to mapOf("longLabel" to false, "shortLabel" to "\n")
    )))
  }
  test("discovery and message collection resolve exactly the same verified name") {
    for (fields in listOf(
      mapOf("conversationShortcut" to mapOf("longLabel" to " System Room ", "shortLabel" to "Short"),
        "conversationTitle" to "Other room"),
      mapOf("conversationShortcut" to mapOf("longLabel" to " ", "shortLabel" to "Short")),
      mapOf("conversationTitle" to " Title "),
      mapOf("extras" to mapOf("android.hiddenConversationTitle" to " Hidden "))
    )) {
      val payload = base() + fields
      val message = KakaoMessageParser.parse(payload).single()
      equal(message.room to message.roomSource, KakaoMessageParser.resolveRoom(payload))
    }
  }
  test("notification title is a sender fallback and never an unverified room") {
    val actual = parse().single()
    equal("", actual.room)
    equal("Alice", actual.sender)
    equal("Hello", actual.msg)
    equal(false, actual.isGroupChat)
    equal(1000L, actual.timestamp)
    equal("notification", actual.timestampSource)
    equal("unknown", actual.roomSource)
    equal("inferred", actual.isGroupChatSource)
    equal("notification:notification-1", actual.conversationKey)
  }
  test("conversation shortcut labels override both explicit conversation titles") {
    val actual = parse(
      "conversationShortcut" to mapOf("longLabel" to "  System Room  ", "shortLabel" to "Short"),
      "conversationTitle" to "Conversation", "hiddenConversationTitle" to "Hidden"
    ).single()
    equal("System Room", actual.room)
    equal("conversationShortcut", actual.roomSource)
    equal("Alice", actual.sender)
  }
  test("blank long shortcut label falls through to short label then conversation title") {
    val actual = parse("conversationShortcut" to mapOf("longLabel" to " \n", "shortLabel" to "  Short  ")).single()
    equal("Short", actual.room)
    equal("conversationShortcut", actual.roomSource)
    val fallback = parse(
      "conversationShortcut" to mapOf("longLabel" to " ", "shortLabel" to "\n"),
      "conversationTitle" to "Conversation"
    ).single()
    equal("Conversation", fallback.room)
    equal("conversationTitle", fallback.roomSource)
  }
  test("non-text shortcut labels and malformed shortcut metadata cannot become room names") {
    val short = parse("conversationShortcut" to mapOf("longLabel" to 42, "shortLabel" to "Short")).single()
    equal("Short", short.room)
    for (shortcut in listOf(null, "Pretend room", mapOf("longLabel" to 42, "shortLabel" to false))) {
      val actual = parse("conversationShortcut" to shortcut).single()
      equal("", actual.room)
      equal("unknown", actual.roomSource)
    }
  }
  test("verified conversation titles use the documented priority") {
    val candidates = linkedMapOf(
      "conversationTitle" to "Conversation",
      "hiddenConversationTitle" to "Hidden"
    )
    for ((source, room) in candidates.toMap()) {
      val actual = KakaoMessageParser.parse(base() + candidates).single()
      equal(room, actual.room)
      equal(source, actual.roomSource)
      candidates[source] = " "
    }
  }
  test("verified conversation titles and ordinary message fields can come from raw extras") {
    for (source in listOf("conversationTitle", "hiddenConversationTitle")) {
      val actual = parse("extras" to mapOf("android.$source" to "Room")).single()
      equal("Room", actual.room)
      equal(source, actual.roomSource)
    }
    val actual = parse(
      "title" to null, "text" to null,
      "extras" to mapOf("android.title" to "Bob", "android.text" to "Extra body")
    ).single()
    equal("Bob", actual.sender)
    equal("Extra body", actual.msg)
    equal("", actual.room)
    equal("unknown", actual.roomSource)
  }
  test("generic titles subtext summary and senders are never room evidence") {
    val actual = parse(
      "subText" to "Subtext", "summaryText" to "Summary", "title" to "Alice",
      "extras" to mapOf(
        "android.subText" to "Extra subtext", "android.summaryText" to "Extra summary",
        "android.title" to "Extra title", "android.messages" to listOf(mapOf(
          "text" to "Body", "sender" to "Bob", "sender_person" to mapOf("name" to "Person")
        ))
      )
    ).single()
    equal("Person", actual.sender)
    equal("", actual.room)
    equal("unknown", actual.roomSource)
    equal(false, actual.isGroupChat)
  }
  test("blank and non-text verified titles leave the room explicitly unknown") {
    val actual = parse(
      "conversationTitle" to 42, "hiddenConversationTitle" to " ",
      "extras" to mapOf("android.conversationTitle" to false, "android.hiddenConversationTitle" to mapOf("name" to "Room"))
    ).single()
    equal("", actual.room)
    equal("unknown", actual.roomSource)
  }
  test("valid top-level fields take precedence over extras") {
    val actual = parse("extras" to mapOf("android.title" to "Bob", "android.text" to "Wrong")).single()
    equal("Alice", actual.sender)
    equal("Hello", actual.msg)
  }
  test("blank top-level fields allow extras and bigText fallback") {
    equal("Expanded", parse("text" to " ", "bigText" to "Expanded").single().msg)
    equal("Expanded extra", parse(
      "text" to null, "extras" to mapOf("android.bigText" to "Expanded extra")
    ).single().msg)
  }
  test("all bundled messages override notification text in order") {
    val actual = parse("conversationTitle" to "Study", "extras" to mapOf(
      "android.messages" to listOf(
        mapOf("text" to "First", "sender" to "Bob", "time" to 10L),
        mapOf("text" to "Second", "sender" to "Carol", "time" to 20L),
        mapOf("text" to "Third", "sender" to "Dave", "time" to 30L)
      )
    ))
    equal(listOf("First", "Second", "Third"), actual.map { it.msg })
    equal(listOf("Bob", "Carol", "Dave"), actual.map { it.sender })
    equal(listOf(10L, 20L, 30L), actual.map { it.timestamp })
    check(actual.all { it.timestampSource == "message" && it.room == "Study" })
  }
  test("identical messages sharing explicit or fallback time retain batch multiplicity") {
    for (time in listOf(null, 50L)) {
      val actual = parse("extras" to mapOf("android.messages" to listOf(
        mapOf("text" to "Again", "sender" to "Bob", "time" to time),
        mapOf("text" to "Different", "sender" to "Bob", "time" to time),
        mapOf("text" to "Again", "sender" to "Bob", "time" to time),
        mapOf("text" to "Again", "sender" to "Carol", "time" to time),
        mapOf("text" to "Again", "sender" to "Bob", "time" to time)
      )))
      equal(listOf(0, 0, 1, 0, 2), actual.map { it.occurrence })
      check(actual.all { it.timestamp == (time ?: 1000L) })
    }
  }
  test("full identical batch replay reuses occurrence ordinals") {
    val batch = mapOf("android.messages" to listOf(
      mapOf("text" to "Again", "sender" to "Bob", "time" to 50L),
      mapOf("text" to "Again", "sender" to "Bob", "time" to 50L)
    ))
    val first = parse("extras" to batch)
    val replay = parse("extras" to batch)
    equal(listOf(0, 1), first.map { it.occurrence })
    equal(first, replay)
    check(first.all { "occurrence" !in it.toMap() })
  }
  test("identical messages with different timestamps each start at ordinal zero") {
    val actual = parse("extras" to mapOf("android.messages" to listOf(
      mapOf("text" to "Again", "sender" to "Bob", "time" to 50L),
      mapOf("text" to "Again", "sender" to "Bob", "time" to 51L)
    )))
    equal(listOf(0, 0), actual.map { it.occurrence })
  }
  test("sender_person name outranks sender and notification title") {
    val actual = parse("extras" to mapOf("android.messages" to listOf(mapOf(
      "text" to "Body", "sender" to "Wrong", "sender_person" to mapOf("name" to "Person")
    )))).single()
    equal("Person", actual.sender)
  }
  test("blank person name falls through to sender then notification title") {
    val actual = parse("extras" to mapOf("android.messages" to listOf(
      mapOf("text" to "One", "sender_person" to mapOf("name" to " "), "sender" to "Bob"),
      mapOf("text" to "Two", "sender" to " ")
    )))
    equal(listOf("Bob", "Alice"), actual.map { it.sender })
  }
  test("legacy bundled android.text and android.title are supported") {
    val actual = parse("extras" to mapOf("android.messages" to listOf(mapOf(
      "android.text" to "Legacy", "android.title" to "Bob", "time" to 50
    )))).single()
    equal("Legacy", actual.msg)
    equal("Bob", actual.sender)
    equal(50L, actual.timestamp)
  }
  test("malformed entries are skipped without losing later messages") {
    val actual = parse("extras" to mapOf("android.messages" to listOf(
      null, "not a bundle", mapOf("text" to 42), mapOf("text" to " "),
      mapOf("text" to "Valid", "sender" to "Bob")
    )))
    equal(listOf("Valid"), actual.map { it.msg })
  }
  test("all-invalid message entries use top-level body") {
    equal("Hello", parse("extras" to mapOf("android.messages" to listOf(
      mapOf("time" to 12L), mapOf("text" to "\n ")
    ))).single().msg)
  }
  test("timestamp uses message then notification timestamp then post time") {
    val actual = parse("notificationTimestamp" to 900L, "extras" to mapOf(
      "android.messages" to listOf(
        mapOf("text" to "Own time", "time" to 100L),
        mapOf("text" to "Zero time", "time" to 0L),
        mapOf("text" to "Missing time")
      )
    ))
    equal(listOf(100L, 900L, 900L), actual.map { it.timestamp })
    equal(listOf("message", "notification", "notification"), actual.map { it.timestampSource })
    equal(1000L, parse("notificationTimestamp" to -1).single().timestamp)
  }
  test("no current time is fabricated and missing body is skipped") {
    equal(emptyList<ParsedKakaoMessage>(), parse("postTime" to 0, "notificationTimestamp" to null))
    equal(emptyList<ParsedKakaoMessage>(), parse("text" to " "))
  }
  test("missing sender preserves valid body without inventing a room") {
    val actual = parse("title" to null).single()
    equal("알 수 없음", actual.sender)
    equal("", actual.room)
    equal("unknown", actual.roomSource)
    equal("Hello", actual.msg)
    equal(false, actual.isGroupChat)
  }
  test("explicit room and unknown sender preserve body without prefix heuristic") {
    val actual = parse("title" to null, "conversationTitle" to "Room", "text" to "Bob: Hello").single()
    equal("알 수 없음", actual.sender)
    equal("Room", actual.room)
    equal("conversationTitle", actual.roomSource)
    equal("Bob: Hello", actual.msg)
    equal(true, actual.isGroupChat)
    equal(emptyList<ParsedKakaoMessage>(), parse("title" to null, "postTime" to null))
  }
  test("valid message time works without any notification time") {
    equal(55L, parse("postTime" to null, "extras" to mapOf(
      "android.messages" to listOf(mapOf("text" to "Message", "time" to 55L))
    )).single().timestamp)
  }
  test("non-finite timestamps fall back safely") {
    equal(1000L, parse("notificationTimestamp" to Double.POSITIVE_INFINITY, "extras" to mapOf(
      "android.messages" to listOf(mapOf("text" to "Message", "time" to Double.NaN))
    )).single().timestamp)
  }
  test("explicit group flag wins over inferred room difference") {
    for (group in listOf(false, true)) {
      val actual = parse("conversationTitle" to "Room", "extras" to mapOf(
        "android.isGroupConversation" to group
      )).single()
      equal(group, actual.isGroupChat)
      equal("notification", actual.isGroupChatSource)
    }
    equal(true, parse("extras" to mapOf("android.isGroupConversation" to true)).single().isGroupChat)
  }
  test("boolean extras win and non-boolean flags are ignored") {
    equal(false, parse("isGroupConversation" to true, "extras" to mapOf(
      "android.isGroupConversation" to false
    )).single().isGroupChat)
    val inferred = parse("conversationTitle" to "Room", "extras" to mapOf(
      "android.isGroupConversation" to "false"
    )).single()
    equal(true, inferred.isGroupChat)
    equal("inferred", inferred.isGroupChatSource)
  }
  test("sender-like prefixes remain ordinary body text without a verified room") {
    val actual = parse("title" to "Study", "text" to "Bob: Ready: now").single()
    equal("", actual.room)
    equal("Study", actual.sender)
    equal("Bob: Ready: now", actual.msg)
    equal(false, actual.isGroupChat)
    equal("unknown", actual.roomSource)
    equal("Bob: Ready", parse("conversationTitle" to "Study", "text" to "Bob: Ready").single().msg)
  }
  test("verified room equal to title never enables destructive colon splitting") {
    for (group in listOf(null, false, true)) {
      val actual = parse("conversationTitle" to "Alice", "text" to "Bob: Ready: now", "extras" to mapOf(
        "android.isGroupConversation" to group
      )).single()
      equal("Alice", actual.room)
      equal("Alice", actual.sender)
      equal("Bob: Ready: now", actual.msg)
      equal(group ?: false, actual.isGroupChat)
    }
  }
  test("explicit message sender prevents heuristic even if it equals room") {
    val actual = parse("extras" to mapOf("android.messages" to listOf(mapOf(
      "sender" to "Alice", "text" to "Bob: Ready"
    )))).single()
    equal("Alice", actual.sender)
    equal("Bob: Ready", actual.msg)
  }
  test("blank prefix or body and colons without space stay intact") {
    for (text in listOf(": body", " : body", "Bob: ", "Bob:   ", "Bob:body")) {
      val actual = parse("text" to text).single()
      equal("Alice", actual.sender)
      equal(text, actual.msg)
    }
  }
  test("message sender never becomes a room when title is absent") {
    val actual = parse("title" to null, "extras" to mapOf(
      "android.messages" to listOf(mapOf("text" to "Hello", "sender" to "Bob"))
    )).single()
    equal("Bob", actual.sender)
    equal("", actual.room)
    equal("unknown", actual.roomSource)
    equal(false, actual.isGroupChat)
  }
  test("conversation identity uses shortcut then tag then notification key") {
    equal("shortcut:shortcut-1", parse("shortcutId" to "shortcut-1", "tag" to "tag-1").single().conversationKey)
    equal("tag:tag-1", parse("tag" to "tag-1").single().conversationKey)
    val one = parse("shortcutId" to "conversation-1").single()
    val two = parse("shortcutId" to "conversation-2").single()
    equal(one.room, two.room)
    check(one.conversationKey != two.conversationKey)
    equal("notification:notification-1", parse("shortcutId" to " ", "tag" to " ").single().conversationKey)
  }
  test("shortcut metadata ID preserves the existing shortcut identity prefix") {
    val metadata = mapOf("id" to " shortcut-1 ", "longLabel" to "Room")
    val direct = parse("shortcutId" to "shortcut-1").single()
    val fromMetadata = parse("conversationShortcut" to metadata, "tag" to "tag-1").single()
    equal(direct.conversationKey, fromMetadata.conversationKey)
    equal("shortcut:shortcut-1", fromMetadata.conversationKey)
    equal("shortcut:direct", parse("shortcutId" to "direct", "conversationShortcut" to metadata).single().conversationKey)
    equal("shortcut:shortcut-1", parse("shortcutId" to " ", "conversationShortcut" to metadata).single().conversationKey)
    equal("tag:tag-1", parse("conversationShortcut" to mapOf("id" to 42), "tag" to "tag-1").single().conversationKey)
  }
  test("body formatting is preserved and labels are trimmed") {
    val actual = parse("title" to "  Alice ", "text" to "  Hello\nworld  ").single()
    equal("Alice", actual.sender)
    equal("  Hello\nworld  ", actual.msg)
  }
  test("export contains public values and excludes persistence conversation key") {
    val actual = parse().single()
    equal(setOf(
      "room", "sender", "msg", "isGroupChat", "timestamp", "timestampSource",
      "roomSource", "isGroupChatSource", "notificationKey"
    ), actual.toMap().keys)
    equal("notification-1", actual.toMap()["notificationKey"])
    equal(1000L, actual.toMap()["timestamp"])
  }
  println("Passed $passed KakaoMessageParser JVM tests")
}

private fun base(): Map<String, Any?> = mapOf(
  "packageName" to "com.kakao.talk",
  "key" to "notification-1",
  "title" to "Alice",
  "text" to "Hello",
  "postTime" to 1000L
)

private fun parse(vararg overrides: Pair<String, Any?>): List<ParsedKakaoMessage> =
  KakaoMessageParser.parse(base() + mapOf(*overrides))

private fun equal(expected: Any?, actual: Any?) {
  check(expected == actual) { "Expected <$expected>, got <$actual>" }
}
