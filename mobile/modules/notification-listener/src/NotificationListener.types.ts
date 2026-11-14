export type NotificationJsonValue =
  | null
  | boolean
  | number
  | string
  | NotificationJsonValue[]
  | { [key: string]: NotificationJsonValue };

export type NotificationPayload = {
  /** Stable Android notification key. Updates can reuse the same key. */
  key: string;
  packageName: string;
  id: number;
  /** Unix timestamp in milliseconds. */
  postTime: number;
  /** Timestamp set by the notifying app; may be zero. Older records may omit it. */
  notificationTimestamp?: number;
  channelId: string | null;
  groupKey: string | null;
  category: string | null;
  isOngoing: boolean;
  title: string | null;
  text: string | null;
  bigText: string | null;
  subText: string | null;
  textLines: string[];
  isGroupSummary: boolean;
  /** Android's conversation title; absent on records collected before this field was added. */
  conversationTitle?: string | null;
  /** Conversation title that AndroidX may hide from the notification header. */
  hiddenConversationTitle?: string | null;
  /** Diagnostic identifiers; neither is guaranteed to be a chatroom name or ID. */
  tag?: string | null;
  shortcutId?: string | null;
  /** Conversation metadata from Android's Ranking, outside notification.extras (API 31+). */
  conversationShortcut?: {
    id: string;
    packageName: string;
    longLabel: string | null;
    shortLabel: string | null;
  } | null;
  /** JSON-safe extras, including app-specific keys and nested messaging data. */
  extras?: { [key: string]: NotificationJsonValue };
};

export type CollectedNotification = NotificationPayload & {
  /** Local, increasing database ID. Use this as the list key and pagination cursor. */
  collectionId: number;
  /** Time the service received the notification, in Unix milliseconds. */
  receivedAt: number;
};

export type GetCollectedNotificationsOptions = {
  /** Page size, from 1 to 500; defaults to 100. Newest records are returned first. */
  limit?: number;
  /** Exclusive collectionId cursor for fetching older records. */
  beforeId?: number;
};

export type KakaoMessage = {
  messageId: number;
  /** Confirmed conversation name; an empty string means it could not be resolved. */
  room: string;
  sender: string;
  msg: string;
  isGroupChat: boolean;
  /** Unix milliseconds from the message, or from the notification as a fallback. */
  timestamp: number;
  timestampSource: 'message' | 'notification';
  roomSource:
    | 'conversationShortcut'
    | 'conversationTitle'
    | 'hiddenConversationTitle'
    | 'unknown';
  isGroupChatSource: 'notification' | 'inferred';
  notificationKey: string;
};

export type GetKakaoMessagesOptions = {
  /** Page size, from 1 to 500; defaults to 100. */
  limit?: number;
  /** Last messageId from the previous page, to fetch older messages. */
  beforeId?: number;
};

/** Names are trimmed, unique, sorted, and matched exactly against parsed chatroom names. */
export type TrackedRoomsChangeListener = (rooms: string[]) => void;

export type NotificationListenerEvents = {
  onNotificationPosted: (notification: CollectedNotification) => void;
  onKakaoMessage: (message: KakaoMessage) => void;
};
