import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import NotificationListener, { type KakaoMessage } from '@/modules/notification-listener';

import { useMessageFavoriteActions } from './use-message-favorite-actions';

type DetailState = { id: number | null; message: KakaoMessage | null; loading: boolean; error: string | null };

export function useMessageDetail(messageId: number | null) {
  const available = NotificationListener.isAvailable();
  const {
    favoritesSupported: supported, favoritePendingIds, favoriteError, favoriteErrorMessageId,
    toggleFavorite: saveFavorite,
  } = useMessageFavoriteActions();
  const [state, setState] = useState<DetailState>({ id: null, message: null, loading: false, error: null });
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const request = useRef(0);

  const refresh = useCallback((): Promise<void> => {
    if (!available || !supported || messageId === null) return Promise.resolve();
    const currentRequest = ++request.current;
    const owner = lifecycle.current;
    const isCurrent = () => mounted.current && owner === lifecycle.current && currentRequest === request.current;
    return Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      setState((previous) => ({ id: messageId, message: previous.id === messageId ? previous.message : null, loading: true, error: null }));
      const message = await NotificationListener.getKakaoMessage(messageId);
      if (isCurrent()) setState({ id: messageId, message, loading: false, error: null });
    }).catch((reason: unknown) => {
      if (isCurrent()) {
        setState({ id: messageId, message: null, loading: false,
          error: reason instanceof Error ? reason.message : '메시지를 불러오지 못했습니다.' });
      }
    });
  }, [available, supported, messageId]);

  useEffect(() => {
    if (!available || !supported || messageId === null) return;
    mounted.current = true;
    const owner = ++lifecycle.current;
    const favoritesSubscription = NotificationListener.addFavoriteMessagesListener((message) => {
      if (!mounted.current || owner !== lifecycle.current || message.messageId !== messageId) return;
      request.current += 1;
      setState({ id: messageId, message, loading: false, error: null });
      void refresh();
    });
    const roomsSubscription = NotificationListener.addTrackedRoomsListener(() => { void refresh(); });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    void refresh();
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      request.current += 1;
      favoritesSubscription.remove();
      roomsSubscription.remove();
      appState.remove();
    };
  }, [available, supported, messageId, refresh]);

  const message = state.id === messageId ? state.message : null;
  const toggleFavorite = useCallback((): Promise<boolean> => (
    message ? saveFavorite(message) : Promise.resolve(false)
  ), [message, saveFavorite]);

  return {
    available, supported, message,
    loading: supported && messageId !== null && (state.id !== messageId || state.loading),
    saving: messageId !== null && favoritePendingIds.has(messageId),
    error: (state.id === messageId ? state.error : null)
      ?? (favoriteErrorMessageId === messageId ? favoriteError : null),
    refresh, toggleFavorite,
  };
}
