import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo';
import { Platform } from 'react-native';

import type {
  CollectedNotification,
  GetCollectedNotificationsOptions,
  NotificationListenerEvents,
} from './NotificationListener.types';

declare class NotificationListenerNativeModule extends NativeModule<NotificationListenerEvents> {
  isPermissionGranted(): boolean;
  openSettings(): Promise<void>;
  getCollectedNotifications(limit: number, beforeId: number | null): Promise<CollectedNotification[]>;
  clearCollectedNotifications(): Promise<void>;
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

const NotificationListener = {
  isAvailable(): boolean {
    return nativeModule !== null;
  },

  isPermissionGranted(): boolean {
    return nativeModule?.isPermissionGranted() ?? false;
  },

  /** Opens system settings. Check permission again when the app becomes active. */
  async openSettings(): Promise<void> {
    await requireModule().openSettings();
  },

  async getCollectedNotifications(
    { limit = 100, beforeId }: GetCollectedNotificationsOptions = {}
  ): Promise<CollectedNotification[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('limit must be an integer between 1 and 500');
    }
    if (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
      throw new RangeError('beforeId must be a positive safe integer');
    }
    return requireModule().getCollectedNotifications(limit, beforeId ?? null);
  },

  async clearCollectedNotifications(): Promise<void> {
    await requireModule().clearCollectedNotifications();
  },

  addNotificationListener(
    listener: (notification: CollectedNotification) => void
  ): EventSubscription {
    return requireModule().addListener('onNotificationPosted', listener);
  },
};

export default NotificationListener;
