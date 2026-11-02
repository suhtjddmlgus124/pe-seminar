export type NotificationPayload = {
  /** Stable Android notification key. Updates can reuse the same key. */
  key: string;
  packageName: string;
  id: number;
  /** Unix timestamp in milliseconds. */
  postTime: number;
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

export type NotificationListenerEvents = {
  onNotificationPosted: (notification: CollectedNotification) => void;
};
