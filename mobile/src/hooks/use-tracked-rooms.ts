import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import NotificationListener from '@/modules/notification-listener';

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '추적 채팅방 설정을 저장하거나 불러오지 못했습니다.';
}

export function useTrackedRooms() {
  const available = NotificationListener.isAvailable();
  const supported = NotificationListener.isTrackedRoomsSupported();
  const [rooms, setRooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(available && supported);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const readRequest = useRef(0);
  const pendingSaves = useRef(0);

  const refresh = useCallback((): Promise<void> => {
    if (!available) return Promise.resolve();
    const request = ++readRequest.current;
    const generation = lifecycle.current;
    const isCurrent = () => mounted.current && generation === lifecycle.current
      && request === readRequest.current;

    return Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      setLoading(true);
      const stored = await NotificationListener.getTrackedRooms();
      if (isCurrent()) {
        setRooms(stored);
        setError(null);
      }
    }).catch((reason: unknown) => {
      if (isCurrent()) setError(errorMessage(reason));
    }).finally(() => {
      if (isCurrent()) setLoading(false);
    });
  }, [available]);

  const changeRoom = useCallback(async (name: string, add: boolean): Promise<boolean> => {
    if (!mounted.current) return false;
    const generation = lifecycle.current;
    const isCurrent = () => mounted.current && generation === lifecycle.current;
    readRequest.current += 1;
    pendingSaves.current += 1;
    setLoading(false);
    setSaving(true);
    setError(null);
    try {
      const stored = await (add
        ? NotificationListener.addTrackedRoom(name)
        : NotificationListener.removeTrackedRoom(name));
      if (!isCurrent()) return false;
      setRooms(stored);
      return true;
    } catch (reason: unknown) {
      if (isCurrent()) setError(errorMessage(reason));
      return false;
    } finally {
      if (isCurrent()) {
        pendingSaves.current -= 1;
        setSaving(pendingSaves.current > 0);
      }
    }
  }, []);

  const addRoom = useCallback((name: string) => changeRoom(name, true), [changeRoom]);
  const removeRoom = useCallback((name: string) => changeRoom(name, false), [changeRoom]);

  useEffect(() => {
    if (!available) return;
    mounted.current = true;
    const generation = ++lifecycle.current;
    const roomsSubscription = NotificationListener.addTrackedRoomsListener((stored) => {
      if (!mounted.current || generation !== lifecycle.current) return;
      // A confirmed room change supersedes reads that began with the previous configuration.
      readRequest.current += 1;
      setRooms(stored);
      setLoading(false);
      setError(null);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    void refresh();

    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      pendingSaves.current = 0;
      roomsSubscription.remove();
      appState.remove();
    };
  }, [available, refresh]);

  return { available, supported, rooms, loading, saving, error, refresh, addRoom, removeRoom };
}
