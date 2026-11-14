import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo';
import { Platform } from 'react-native';

import type {
  CollectedNotification,
  GetCollectedNotificationsOptions,
  GetKakaoMessagesOptions,
  KakaoMessage,
  NotificationListenerEvents,
  TrackedRoomsChangeListener,
} from './NotificationListener.types';

declare class NotificationListenerNativeModule extends NativeModule<NotificationListenerEvents> {
  readonly roomResolutionVersion: number;
  isPermissionGranted(): boolean;
  openSettings(): Promise<void>;
  getCollectedNotifications(limit: number, beforeId: number | null): Promise<CollectedNotification[]>;
  clearCollectedNotifications(): Promise<void>;
  getKakaoMessages(limit: number, beforeId: number | null): Promise<KakaoMessage[]>;
  clearKakaoMessages(): Promise<void>;
  getTrackedRooms(): Promise<string[]>;
  setTrackedRooms(rooms: string[]): Promise<string[]>;
  getDiscoveredRooms(): Promise<string[]>;
}

const nativeModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NotificationListenerNativeModule>('NotificationListener')
    : null;

function requireModule(): NotificationListenerNativeModule {
  if (!nativeModule) {
    throw new Error(
      'NotificationListener requires an Android build containing the local native module. Run npx expo run:android; Expo Go, iOS, and web are not supported.'
    );
  }

  return nativeModule;
}

function requireKakaoModule(): NotificationListenerNativeModule {
  const module = requireModule();
  if (typeof module.getKakaoMessages !== 'function') {
    throw new Error('카카오톡 메시지 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.');
  }
  requireRoomResolution(module);
  return module;
}

function requireRoomResolution(module: NotificationListenerNativeModule): void {
  if (!(module.roomResolutionVersion >= 1)) {
    throw new Error('채팅방 이름 추출이 수정된 새 Android 개발 빌드를 설치해 주세요.');
  }
}

function requireTrackedRoomsModule(): NotificationListenerNativeModule {
  const module = requireModule();
  if (typeof module.getTrackedRooms !== 'function' || typeof module.setTrackedRooms !== 'function') {
    throw new Error('추적 채팅방 설정 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.');
  }
  requireRoomResolution(module);
  return module;
}

function requireDiscoveredRoomsModule(): NotificationListenerNativeModule {
  const module = requireModule();
  if (typeof module.getDiscoveredRooms !== 'function') {
    throw new Error('알림에서 발견한 채팅방 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.');
  }
  requireRoomResolution(module);
  return module;
}

function normalizeRooms(rooms: string[]): string[] {
  if (!Array.isArray(rooms) || rooms.some((room) => typeof room !== 'string')) {
    throw new TypeError('채팅방 이름은 문자열 목록이어야 합니다.');
  }
  return [...new Set(rooms.map((room) => room.trim()).filter(Boolean))].sort();
}

let knownRooms: string[] | null = null;
let trackedRoomsQueue: Promise<void> = Promise.resolve();
const trackedRoomsListeners = new Set<TrackedRoomsChangeListener>();

function publishRooms(rooms: string[]): string[] {
  const normalized = normalizeRooms(rooms);
  if (knownRooms === null || knownRooms.length !== normalized.length
    || knownRooms.some((room, index) => room !== normalized[index])) {
    knownRooms = normalized;
    for (const listener of trackedRoomsListeners) {
      try {
        listener([...normalized]);
      } catch {
        // A subscriber must not turn a successful database write into a failed save.
      }
    }
  }
  return [...normalized];
}

function queueTrackedRooms<T>(operation: () => Promise<T>): Promise<T> {
  const result = trackedRoomsQueue.then(operation);
  trackedRoomsQueue = result.then(() => {}, () => {});
  return result;
}

function changeTrackedRoom(room: string, add: boolean): Promise<string[]> {
  const name = room.trim();
  if (!name) return Promise.reject(new Error('채팅방 이름을 입력해 주세요.'));
  const module = requireTrackedRoomsModule();
  return queueTrackedRooms(async () => {
    // Read inside the queue so edits from separate mounted tabs do not overwrite each other.
    const rooms = normalizeRooms(await module.getTrackedRooms());
    const next = add ? [...rooms, name] : rooms.filter((existing) => existing !== name);
    return publishRooms(await module.setTrackedRooms(normalizeRooms(next)));
  });
}

function pagination({ limit = 100, beforeId }: GetCollectedNotificationsOptions) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError('limit must be an integer between 1 and 500');
  }
  if (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
    throw new RangeError('beforeId must be a positive safe integer');
  }
  return { limit, beforeId: beforeId ?? null };
}

const NotificationListener = {
  isAvailable(): boolean {
    return nativeModule !== null;
  },

  isTrackedRoomsSupported(): boolean {
    return nativeModule !== null && typeof nativeModule.getTrackedRooms === 'function'
      && typeof nativeModule.setTrackedRooms === 'function' && nativeModule.roomResolutionVersion >= 1;
  },

  isDiscoveredRoomsSupported(): boolean {
    return nativeModule !== null && typeof nativeModule.getDiscoveredRooms === 'function'
      && nativeModule.roomResolutionVersion >= 1;
  },

  /** Observed names only. Registration controls which stored messages are visible. */
  async getDiscoveredRooms(): Promise<string[]> {
    return normalizeRooms(await requireDiscoveredRoomsModule().getDiscoveredRooms());
  },

  /** Re-read names after the native database commits a newly discovered room. */
  addDiscoveredRoomsListener(listener: () => void): EventSubscription {
    return requireDiscoveredRoomsModule().addListener('onDiscoveredRoomsChanged', listener);
  },

  async getTrackedRooms(): Promise<string[]> {
    const module = requireTrackedRoomsModule();
    return queueTrackedRooms(async () => publishRooms(await module.getTrackedRooms()));
  },

  async setTrackedRooms(rooms: string[]): Promise<string[]> {
    const module = requireTrackedRoomsModule();
    const next = normalizeRooms(rooms);
    return queueTrackedRooms(async () => publishRooms(await module.setTrackedRooms(next)));
  },

  async addTrackedRoom(room: string): Promise<string[]> {
    return changeTrackedRoom(room, true);
  },

  async removeTrackedRoom(room: string): Promise<string[]> {
    return changeTrackedRoom(room, false);
  },

  /** Local notifications are emitted only after the database confirms its stored room list. */
  addTrackedRoomsListener(listener: TrackedRoomsChangeListener): EventSubscription {
    trackedRoomsListeners.add(listener);
    return { remove() { trackedRoomsListeners.delete(listener); } };
  },

  isPermissionGranted(): boolean {
    return nativeModule?.isPermissionGranted() ?? false;
  },

  /** Opens system settings. Check permission again when the app becomes active. */
  async openSettings(): Promise<void> {
    await requireModule().openSettings();
  },

  async getCollectedNotifications(
    options: GetCollectedNotificationsOptions = {}
  ): Promise<CollectedNotification[]> {
    const { limit, beforeId } = pagination(options);
    return requireModule().getCollectedNotifications(limit, beforeId);
  },

  async clearCollectedNotifications(): Promise<void> {
    await requireModule().clearCollectedNotifications();
  },

  async getKakaoMessages(options: GetKakaoMessagesOptions = {}): Promise<KakaoMessage[]> {
    const { limit, beforeId } = pagination(options);
    return requireKakaoModule().getKakaoMessages(limit, beforeId);
  },

  async clearKakaoMessages(): Promise<void> {
    await requireKakaoModule().clearKakaoMessages();
  },

  addListener<EventName extends keyof NotificationListenerEvents>(
    eventName: EventName,
    listener: NotificationListenerEvents[EventName]
  ): EventSubscription {
    const module = eventName === 'onKakaoMessage' ? requireKakaoModule()
      : eventName === 'onDiscoveredRoomsChanged' ? requireDiscoveredRoomsModule() : requireModule();
    return module.addListener(eventName, listener);
  },

  addKakaoMessageListener(listener: (message: KakaoMessage) => void): EventSubscription {
    return requireKakaoModule().addListener('onKakaoMessage', listener);
  },

  addNotificationListener(
    listener: (notification: CollectedNotification) => void
  ): EventSubscription {
    return requireModule().addListener('onNotificationPosted', listener);
  },
};

export default NotificationListener;
