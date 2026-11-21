import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import NotificationListener from '@/modules/notification-listener';

export function useDiscoveredRooms() {
  const available = NotificationListener.isAvailable();
  const supported = NotificationListener.isDiscoveredRoomsSupported();
  const [rooms, setRooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(available && supported);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const readRequest = useRef(0);

  const refresh = useCallback((): Promise<void> => {
    if (!available || !supported) return Promise.resolve();
    const request = ++readRequest.current;
    const generation = lifecycle.current;
    const isCurrent = () => mounted.current && generation === lifecycle.current
      && request === readRequest.current;

    return Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      setLoading(true);
      const stored = await NotificationListener.getDiscoveredRooms();
      if (isCurrent()) {
        setRooms(stored);
        setError(null);
      }
    }).catch((reason: unknown) => {
      if (isCurrent()) {
        setError(reason instanceof Error ? reason.message : '알림에서 찾은 채팅방을 불러오지 못했습니다.');
      }
    }).finally(() => {
      if (isCurrent()) setLoading(false);
    });
  }, [available, supported]);

  useEffect(() => {
    if (!available || !supported) return;
    mounted.current = true;
    lifecycle.current += 1;
    const subscription = NotificationListener.addDiscoveredRoomsListener(() => { void refresh(); });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    void refresh();

    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      subscription.remove();
      appState.remove();
    };
  }, [available, supported, refresh]);

  return { supported, rooms, loading, error, refresh };
}
