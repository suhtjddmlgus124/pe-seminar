import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import NotificationListener, { type KakaoMessage } from '@/modules/notification-listener';

import { useMessageFavoriteActions } from './use-message-favorite-actions';

const PAGE_SIZE = 100;

function mergeMessages(current: KakaoMessage[], incoming: KakaoMessage[]): KakaoMessage[] {
  const messages = new Map(current.map((message) => [message.messageId, message]));
  for (const message of incoming) messages.set(message.messageId, message);
  return [...messages.values()].sort(
    (left, right) => right.timestamp - left.timestamp || right.messageId - left.messageId
  );
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '메시지 기록을 불러오지 못했습니다.';
}

export function useKakaoMessages() {
  const { favoritesSupported, favoritePendingIds, favoriteError, toggleFavorite } = useMessageFavoriteActions();
  const available = NotificationListener.isAvailable();
  const [granted, setGranted] = useState(false);
  const [messages, setMessages] = useState<KakaoMessage[]>([]);
  const [trackedRooms, setTrackedRooms] = useState<string[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(available);
  const [refreshing, setRefreshing] = useState(available);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const historyGeneration = useRef(0);
  const olderPending = useRef(false);
  const refreshingHistory = useRef(false);
  const rows = useRef<KakaoMessage[]>([]);
  const allowedRooms = useRef<Set<string> | null>(null);
  const olderCursor = useRef<number | undefined>(undefined);
  const moreHistory = useRef(false);
  const favoriteChanges = useRef(new Map<number, boolean>());

  const merge = useCallback((incoming: KakaoMessage[]) => {
    const allowed = incoming.filter((message) => allowedRooms.current?.has(message.room)).map((message) => ({
      ...message,
      // A page started before a save must not undo the confirmed favorite state.
      isFavorite: favoriteChanges.current.get(message.messageId) ?? Boolean(message.isFavorite),
    }));
    rows.current = mergeMessages(rows.current, allowed);
    setMessages(rows.current);
  }, []);

  const resetHistory = useCallback(() => {
    historyGeneration.current += 1;
    rows.current = [];
    olderCursor.current = undefined;
    moreHistory.current = false;
    olderPending.current = false;
    setMessages([]);
    setLoadingMore(false);
    setHasMore(false);
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (!available) return Promise.resolve();
    const generation = ++historyGeneration.current;
    const owner = lifecycle.current;
    const isCurrent = () => mounted.current && owner === lifecycle.current
      && generation === historyGeneration.current;

    return Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      // Re-read configuration before every history refresh, including foreground/focus.
      // Clear pagination so pages from two room configurations can never be combined.
      rows.current = [];
      allowedRooms.current = null;
      olderCursor.current = undefined;
      olderPending.current = false;
      moreHistory.current = false;
      refreshingHistory.current = true;
      setMessages([]);
      setHasMore(false);
      setLoadingMore(false);
      setRefreshing(true);
      setTrackingLoading(true);
      setGranted(NotificationListener.isPermissionGranted());
      const rooms = await NotificationListener.getTrackedRooms();
      if (!isCurrent()) return;
      allowedRooms.current = new Set(rooms);
      setTrackedRooms(rooms);
      setTrackingLoading(false);
      if (rooms.length === 0) {
        setError(null);
        return;
      }
      const page = await NotificationListener.getKakaoMessages({ limit: PAGE_SIZE });
      if (!isCurrent()) return;
      merge(page);
      olderCursor.current = page[page.length - 1]?.messageId;
      moreHistory.current = page.length === PAGE_SIZE;
      setHasMore(moreHistory.current);
      setError(null);
    }).catch((reason: unknown) => {
      if (isCurrent()) setError(errorMessage(reason));
    }).finally(() => {
      if (isCurrent()) {
        refreshingHistory.current = false;
        setTrackingLoading(false);
        setRefreshing(false);
      }
    });
  }, [available, merge]);

  const loadMore = useCallback(() => {
    const beforeId = olderCursor.current;
    if (!available || refreshingHistory.current || !moreHistory.current
      || olderPending.current || beforeId === undefined || allowedRooms.current === null) return;
    olderPending.current = true;
    setLoadingMore(true);
    const generation = historyGeneration.current;
    const owner = lifecycle.current;
    const isCurrent = () => mounted.current && owner === lifecycle.current
      && generation === historyGeneration.current;

    void NotificationListener.getKakaoMessages({ limit: PAGE_SIZE, beforeId }).then((page) => {
      if (!isCurrent()) return;
      merge(page);
      olderCursor.current = page[page.length - 1]?.messageId ?? beforeId;
      moreHistory.current = page.length === PAGE_SIZE;
      setHasMore(moreHistory.current);
      setError(null);
    }).catch((reason: unknown) => {
      if (isCurrent()) setError(errorMessage(reason));
    }).finally(() => {
      if (isCurrent()) {
        olderPending.current = false;
        setLoadingMore(false);
      }
    });
  }, [available, merge]);

  const openSettings = useCallback(() => {
    const generation = lifecycle.current;
    void NotificationListener.openSettings().catch((reason: unknown) => {
      if (mounted.current && generation === lifecycle.current) setError(errorMessage(reason));
    });
  }, []);

  useEffect(() => {
    if (!available) return;
    mounted.current = true;
    const owner = ++lifecycle.current;
    let subscription: ReturnType<typeof NotificationListener.addKakaoMessageListener> | undefined;
    const roomsSubscription = NotificationListener.addTrackedRoomsListener((rooms) => {
      if (!mounted.current || owner !== lifecycle.current) return;
      // Synchronously reject queued events and in-flight pages from removed rooms.
      allowedRooms.current = new Set(rooms);
      setTrackedRooms(rooms);
      resetHistory();
      void refresh();
    });
    const favoritesSubscription = NotificationListener.addFavoriteMessagesListener((message) => {
      if (!mounted.current || owner !== lifecycle.current) return;
      favoriteChanges.current.set(message.messageId, message.isFavorite);
      // A favorite from an unregistered room must never enter the main feed.
      rows.current = rows.current
        .map((stored) => stored.messageId === message.messageId ? message : stored)
        .filter((stored) => allowedRooms.current?.has(stored.room));
      setMessages(rows.current);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    void Promise.resolve().then(() => {
      if (!mounted.current || owner !== lifecycle.current) return;
      try {
        if (NotificationListener.isTrackedRoomsSupported()) {
          subscription = NotificationListener.addKakaoMessageListener((message) => {
            if (mounted.current && owner === lifecycle.current) merge([message]);
          });
        }
        setSubscriptionError(null);
      } catch (reason: unknown) {
        setSubscriptionError(errorMessage(reason));
      }
      void refresh();
    });

    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      historyGeneration.current += 1;
      olderPending.current = false;
      roomsSubscription.remove();
      favoritesSubscription.remove();
      subscription?.remove();
      appState.remove();
    };
  }, [available, merge, refresh, resetHistory]);

  return {
    available, granted, messages, trackedRooms, trackingLoading, refreshing, loadingMore, hasMore,
    error: error ?? subscriptionError ?? favoriteError, refresh, loadMore, openSettings,
    favoritesSupported, favoritePendingIds, toggleFavorite,
  };
}
