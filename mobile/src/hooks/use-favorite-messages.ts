import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import NotificationListener, { type KakaoMessage } from '@/modules/notification-listener';

import { useMessageFavoriteActions } from './use-message-favorite-actions';

const PAGE_SIZE = 100;

function mergeMessages(current: KakaoMessage[], incoming: KakaoMessage[]): KakaoMessage[] {
  const merged = new Map(current.map((message) => [message.messageId, message]));
  for (const message of incoming) {
    if (message.isFavorite) merged.set(message.messageId, message);
    else merged.delete(message.messageId);
  }
  return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp || b.messageId - a.messageId);
}

export function useFavoriteMessages() {
  const available = NotificationListener.isAvailable();
  const { favoritesSupported: supported, favoritePendingIds, favoriteError, toggleFavorite } = useMessageFavoriteActions();
  const [messages, setMessages] = useState<KakaoMessage[]>([]);
  const [refreshing, setRefreshing] = useState(available && supported);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const generation = useRef(0);
  const rows = useRef<KakaoMessage[]>([]);
  const cursor = useRef<number | undefined>(undefined);
  const more = useRef(false);
  const reading = useRef(false);
  const olderPending = useRef(false);

  const refresh = useCallback((): Promise<void> => {
    if (!available || !supported) return Promise.resolve();
    const request = ++generation.current;
    const owner = lifecycle.current;
    const isCurrent = () => mounted.current && owner === lifecycle.current && request === generation.current;
    reading.current = true;
    olderPending.current = false;
    cursor.current = undefined;
    more.current = false;
    return Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      setRefreshing(true);
      setLoadingMore(false);
      setHasMore(false);
      const page = await NotificationListener.getFavoriteMessages({ limit: PAGE_SIZE });
      if (!isCurrent()) return;
      rows.current = mergeMessages([], page);
      setMessages(rows.current);
      cursor.current = page.at(-1)?.messageId;
      more.current = page.length === PAGE_SIZE;
      setHasMore(more.current);
      setError(null);
    }).catch((reason: unknown) => {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : '즐겨찾기를 불러오지 못했습니다.');
    }).finally(() => {
      if (isCurrent()) {
        reading.current = false;
        setRefreshing(false);
      }
    });
  }, [available, supported]);

  const loadMore = useCallback(() => {
    const beforeId = cursor.current;
    if (!mounted.current || !available || !supported || reading.current || olderPending.current
      || !more.current || beforeId === undefined) return;
    olderPending.current = true;
    setLoadingMore(true);
    const owner = lifecycle.current;
    const request = generation.current;
    const isCurrent = () => mounted.current && owner === lifecycle.current && request === generation.current;
    void NotificationListener.getFavoriteMessages({ limit: PAGE_SIZE, beforeId }).then((page) => {
      if (!isCurrent()) return;
      rows.current = mergeMessages(rows.current, page);
      setMessages(rows.current);
      cursor.current = page.at(-1)?.messageId ?? beforeId;
      more.current = page.length === PAGE_SIZE;
      setHasMore(more.current);
      setError(null);
    }).catch((reason: unknown) => {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : '이전 즐겨찾기를 불러오지 못했습니다.');
    }).finally(() => {
      if (isCurrent()) {
        olderPending.current = false;
        setLoadingMore(false);
      }
    });
  }, [available, supported]);

  useEffect(() => {
    if (!available || !supported) return;
    mounted.current = true;
    const owner = ++lifecycle.current;
    const subscription = NotificationListener.addFavoriteMessagesListener((message) => {
      if (!mounted.current || owner !== lifecycle.current) return;
      rows.current = mergeMessages(rows.current, [message]);
      setMessages(rows.current);
      // Saved membership changes invalidate both in-flight pages and their cursors.
      void refresh();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    void refresh();
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      generation.current += 1;
      subscription.remove();
      appState.remove();
    };
  }, [available, supported, refresh]);

  return {
    available, supported, messages, refreshing, loadingMore, hasMore,
    error: error ?? favoriteError, refresh, loadMore, favoritePendingIds, toggleFavorite,
  };
}
