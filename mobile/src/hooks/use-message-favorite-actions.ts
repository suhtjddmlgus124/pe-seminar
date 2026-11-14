import { useCallback, useEffect, useRef, useState } from 'react';

import NotificationListener, { type KakaoMessage } from '@/modules/notification-listener';

export function useMessageFavoriteActions() {
  const favoritesSupported = NotificationListener.isFavoritesSupported();
  const [favoritePendingIds, setFavoritePendingIds] = useState<ReadonlySet<number>>(new Set());
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoriteErrorMessageId, setFavoriteErrorMessageId] = useState<number | null>(null);
  const pending = useRef(new Set<number>());
  const mounted = useRef(false);
  const lifecycle = useRef(0);

  useEffect(() => {
    mounted.current = true;
    lifecycle.current += 1;
    const pendingRequests = pending.current;
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      pendingRequests.clear();
    };
  }, []);

  const toggleFavorite = useCallback(async (message: KakaoMessage): Promise<boolean> => {
    if (!mounted.current || pending.current.has(message.messageId)) return false;
    if (!favoritesSupported) {
      setFavoriteError('즐겨찾기 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.');
      setFavoriteErrorMessageId(message.messageId);
      return false;
    }
    const generation = lifecycle.current;
    const isCurrent = () => mounted.current && generation === lifecycle.current;
    pending.current.add(message.messageId);
    setFavoritePendingIds(new Set(pending.current));
    setFavoriteError(null);
    setFavoriteErrorMessageId(null);
    try {
      await NotificationListener.setMessageFavorite(message.messageId, !message.isFavorite);
      return isCurrent();
    } catch (reason: unknown) {
      if (isCurrent()) {
        setFavoriteError(reason instanceof Error ? reason.message : '즐겨찾기를 저장하지 못했습니다.');
        setFavoriteErrorMessageId(message.messageId);
      }
      return false;
    } finally {
      if (isCurrent()) {
        pending.current.delete(message.messageId);
        setFavoritePendingIds(new Set(pending.current));
      }
    }
  }, [favoritesSupported]);

  return { favoritesSupported, favoritePendingIds, favoriteError, favoriteErrorMessageId, toggleFavorite };
}
