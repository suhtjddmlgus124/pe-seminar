package expo.modules.notificationlistener

/**
 * Standalone JVM checks with no Android SDK or test dependency:
 * kotlinc android/src/main/java/expo/modules/notificationlistener/TrackedRooms.kt \
 *   tests/TrackedRoomsTest.kt -include-runtime -d tracked-rooms-tests.jar
 * java -jar tracked-rooms-tests.jar
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

  test("empty registration displays no room") {
    check(!TrackedRooms.matches("공지방", emptySet(), "conversationTitle"))
    check(TrackedRooms.normalize(emptyList()).isEmpty())
  }
  test("verified rooms remain eligible for storage before registration and after removal") {
    for (source in listOf("conversationShortcut", "conversationTitle", "hiddenConversationTitle")) {
      check(TrackedRooms.isVerifiedRoom("공지방", source))
      check(!TrackedRooms.matches("공지방", emptySet(), source))
      check(TrackedRooms.matches("공지방", setOf("공지방"), source))
      check(TrackedRooms.isVerifiedRoom("공지방", source))
    }
    for (source in listOf(null, "unknown", "title", "sender", "subText", "summaryText")) {
      check(!TrackedRooms.isVerifiedRoom("Alice", source))
    }
    for (room in listOf(null, "", " \n")) {
      check(!TrackedRooms.isVerifiedRoom(room, "conversationTitle"))
    }
  }
  test("registration trims names and drops empty or duplicate entries") {
    check(TrackedRooms.normalize(listOf("  공지방 ", "", "\t\n", "공지방")) == listOf("공지방"))
  }
  test("normalization returns a deterministic sorted list") {
    check(TrackedRooms.normalize(listOf("Team B", " Team A ", "Team B")) == listOf("Team A", "Team B"))
  }
  test("multiple registered rooms match independently") {
    val rooms = TrackedRooms.normalize(listOf("공지방", "개발방")).toSet()
    check(TrackedRooms.matches("공지방", rooms, "conversationTitle"))
    check(TrackedRooms.matches("개발방", rooms, "hiddenConversationTitle"))
    check(!TrackedRooms.matches("다른방", rooms, "conversationTitle"))
  }
  test("matching uses the complete name and respects case") {
    val rooms = setOf("Team")
    check(TrackedRooms.matches("Team", rooms, "conversationTitle"))
    check(!TrackedRooms.matches("Team announcements", rooms, "conversationTitle"))
    check(!TrackedRooms.matches("My Team", rooms, "conversationTitle"))
    check(!TrackedRooms.matches("team", rooms, "conversationTitle"))
  }
  test("removing a room immediately stops matching it") {
    val before = TrackedRooms.normalize(listOf("Team A", "Team B")).toSet()
    val after = TrackedRooms.normalize(listOf("Team B")).toSet()
    check(TrackedRooms.matches("Team A", before, "conversationTitle"))
    check(!TrackedRooms.matches("Team A", after, "conversationTitle"))
    check(TrackedRooms.matches("Team B", after, "conversationTitle"))
  }
  test("only explicit conversation metadata can identify a tracked room") {
    for (source in listOf("conversationShortcut", "conversationTitle", "hiddenConversationTitle")) {
      check(TrackedRooms.matches("Team", setOf("Team"), source))
    }
    for (source in listOf(null, "unknown", "title", "sender", "subText", "summaryText")) {
      check(!TrackedRooms.matches("Bob", setOf("Bob"), source))
    }
    check(!TrackedRooms.matches("", setOf(""), "conversationTitle"))
  }
  test("verified source ranks can repair legacy and unknown room metadata") {
    check(TrackedRooms.sourceRank("conversationShortcut") == 0)
    check(TrackedRooms.sourceRank("conversationTitle") == 1)
    check(TrackedRooms.sourceRank("hiddenConversationTitle") == 2)
    for (source in listOf(null, "unknown", "title", "sender", "subText", "summaryText")) {
      check(TrackedRooms.sourceRank(source) == Int.MAX_VALUE)
    }
  }
  test("authoritative renamed rooms update while identical or lower-priority data does not") {
    check(TrackedRooms.shouldUpdateRoom("Room A", "conversationShortcut", "Room B", "conversationShortcut"))
    check(!TrackedRooms.shouldUpdateRoom("Room B", "conversationShortcut", "Room B", "conversationShortcut"))
    check(!TrackedRooms.shouldUpdateRoom("Room B", "conversationShortcut", "Room A", "conversationTitle"))
    check(!TrackedRooms.shouldUpdateRoom("Room B", "conversationTitle", "Bob", "title"))
    check(TrackedRooms.shouldUpdateRoom("", "unknown", "Room B", "conversationTitle"))
    check(TrackedRooms.shouldUpdateRoom("Bob", "title", "Room B", "conversationTitle"))
  }
  test("legacy migration removes guessed room names while preserving the other values") {
    for (source in listOf(null, "unknown", "title", "sender", "subText", "summaryText")) {
      val payload = mutableMapOf<String, Any?>(
        "room" to "Bob", "sender" to "Bob", "msg" to "Original body", "timestamp" to 1234L,
        "notificationKey" to "original", "isGroupChat" to false
      )
      if (source != null) payload["roomSource"] = source
      val expectedOtherValues = payload.filterKeys { it != "room" && it != "roomSource" }
      TrackedRooms.sanitizeStoredMessageRoom(payload)
      check(payload["room"] == "")
      check(payload["roomSource"] == "unknown")
      check(payload.filterKeys { it != "room" && it != "roomSource" } == expectedOtherValues)
    }
  }
  test("migration preserves verified room names and invalidates blank names") {
    for (source in listOf("conversationShortcut", "conversationTitle", "hiddenConversationTitle")) {
      val payload = mutableMapOf<String, Any?>("room" to "Team", "roomSource" to source, "msg" to "Hello")
      val original = payload.toMap()
      TrackedRooms.sanitizeStoredMessageRoom(payload)
      check(payload == original)
      payload["room"] = " "
      TrackedRooms.sanitizeStoredMessageRoom(payload)
      check(payload["room"] == "" && payload["roomSource"] == "unknown")
    }
  }

  println("TrackedRooms: $passed checks passed")
}
