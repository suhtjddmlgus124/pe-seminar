import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import NotificationListener, { type CollectedNotification } from '@/modules/notification-listener';

export default function HomeScreen() {
  const available = NotificationListener.isAvailable();
  const [granted, setGranted] = useState(() => NotificationListener.isPermissionGranted());
  const [notifications, setNotifications] = useState<CollectedNotification[]>([]);
  const [refreshing, setRefreshing] = useState(available);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    if (!available) return Promise.resolve();
    const request = ++requestId.current;
    return NotificationListener.getCollectedNotifications({ limit: 100 })
      .then((collected) => {
        if (!mounted.current || request !== requestId.current) return;
        setNotifications(collected);
        setGranted(NotificationListener.isPermissionGranted());
        setError(null);
      })
      .catch((reason: unknown) => {
        if (mounted.current && request === requestId.current) {
          setError(reason instanceof Error ? reason.message : '알림 기록을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (mounted.current && request === requestId.current) setRefreshing(false);
      });
  }, [available]);

  useEffect(() => {
    if (!available) return;
    mounted.current = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    // Subscribe before loading history so notifications received during loading are included.
    const subscription = NotificationListener.addNotificationListener(() => {
      if (refreshTimer !== undefined) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refresh();
      }, 200);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    void refresh();
    return () => {
      mounted.current = false;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      subscription.remove();
      appState.remove();
    };
  }, [available, refresh]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.collectionId)}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={available ? () => { setRefreshing(true); void refresh(); } : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="subtitle">알림 JSON</ThemedText>
              <ThemedText themeColor="textSecondary">
                모듈에서 수집한 최근 알림 100개의 전체 객체를 JSON 그대로 표시합니다.
              </ThemedText>
              <ThemedText type="smallBold">
                {!available
                  ? 'Android 전용 기능입니다.'
                  : granted ? '알림 접근 권한이 허용되어 있습니다.' : '알림 접근 권한을 허용해 주세요.'}
              </ThemedText>
              {available ? (
                <Button
                  title="알림 접근 설정 열기"
                  onPress={() => {
                    NotificationListener.openSettings().catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : '설정을 열지 못했습니다.');
                    });
                  }}
                />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  알림 수집 기능이 포함된 Android 앱에서 사용할 수 있습니다.
                </ThemedText>
              )}
              {error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
            </View>
          }
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary">
              {refreshing ? '수집 기록을 불러오는 중입니다.' : '아직 수집된 알림이 없습니다.'}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.notification}>
              <ThemedText type="code" selectable style={styles.json}>
                {JSON.stringify(item, null, 2)}
              </ThemedText>
            </ThemedView>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  list: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three },
  header: { gap: Spacing.three, marginBottom: Spacing.three },
  notification: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  json: { fontWeight: '400', lineHeight: 18 },
});
