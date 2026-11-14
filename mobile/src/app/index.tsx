import { Link, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Button, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useKakaoMessages } from '@/hooks/use-kakao-messages';
import { type KakaoMessage } from '@/modules/notification-listener';

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '시각 확인 불가';
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function MessageCard({ message }: { message: KakaoMessage }) {
  const resolvedRoom = message.roomSource === 'conversationShortcut'
    || message.roomSource === 'conversationTitle'
    || message.roomSource === 'hiddenConversationTitle';
  const chatType = message.isGroupChat ? '그룹 채팅' : '1:1 채팅';

  return (
    <ThemedView type="backgroundElement" style={styles.message}>
      <View style={styles.roomHeader}>
        <ThemedText type="smallBold" selectable style={styles.room}>
          {resolvedRoom && message.room ? message.room : '채팅방 이름 확인 불가'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {chatType}{message.isGroupChatSource === 'inferred' ? ' (추정)' : ''}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" selectable>
        보낸 사람 · {message.sender}
      </ThemedText>
      <ThemedText selectable style={styles.messageText}>{message.msg}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {message.timestampSource === 'message' ? '메시지 시각' : '알림 시각'} · {formatTimestamp(message.timestamp)}
      </ThemedText>
    </ThemedView>
  );
}

export default function HomeScreen() {
  const {
    available, granted, messages, refreshing, loadingMore, hasMore,
    error, refresh, loadMore, openSettings, trackedRooms, trackingLoading,
  } = useKakaoMessages();

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.messageId)}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={available ? () => { void refresh(); } : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="subtitle">카카오톡 메시지</ThemedText>
              <ThemedText themeColor="textSecondary">
                등록한 추적 채팅방의 메시지를 최신 시각순으로 표시합니다.
                이전 기록도 계속 불러올 수 있습니다.
              </ThemedText>
              <ThemedView type="backgroundElement" style={styles.trackingNotice}>
                <ThemedText type="small">
                  {trackingLoading
                    ? '추적 채팅방 설정을 확인하는 중입니다.'
                    : !available ? 'Android 앱에서 추적할 채팅방을 등록해 주세요.'
                      : error ? '추적 설정과 메시지 기록을 확인해 주세요.'
                        : trackedRooms.length === 0 ? '채팅방을 등록하면 저장해 둔 메시지를 볼 수 있습니다.'
                          : `${trackedRooms.length}개 채팅방의 메시지를 표시하고 있습니다.`}
                </ThemedText>
                <Link href="./tracked-rooms" accessibilityRole="link">
                  <ThemedText type="linkPrimary">추적 채팅방 등록·관리</ThemedText>
                </Link>
              </ThemedView>
              <ThemedText type="smallBold">
                {!available
                  ? 'Android 앱에서 사용할 수 있습니다.'
                  : granted ? '알림 접근 권한이 허용되어 있습니다.' : '알림 접근 권한을 허용해 주세요.'}
              </ThemedText>
              {available ? (
                <Button title="알림 접근 설정 열기" onPress={openSettings} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  알림 수집 모듈이 포함된 Android 앱이 필요합니다.
                </ThemedText>
              )}
              {available && !granted && (
                <ThemedText type="small" themeColor="textSecondary">
                  설정에서 이 앱의 알림 접근을 허용하면 이름을 확인할 수 있는 채팅방의 메시지를
                  등록 여부와 관계없이 기기에 저장합니다. 등록한 방의 메시지만 목록에 표시합니다.
                  이미 저장된 기록은 권한 없이도 볼 수 있습니다.
                </ThemedText>
              )}
              {error && (
                <View style={styles.error}>
                  <ThemedText accessibilityRole="alert">{error}</ThemedText>
                  <Button
                    title="다시 불러오기"
                    onPress={() => { void refresh(); }}
                    disabled={refreshing}
                  />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              {refreshing && <ActivityIndicator />}
              <ThemedText themeColor="textSecondary">
                {refreshing
                  ? '메시지 기록을 불러오는 중입니다.'
                  : error ? '기록을 불러오지 못했습니다.'
                    : !available ? '메시지 목록은 Android 앱에서 확인해 주세요.'
                      : trackingLoading ? '추적 채팅방 설정을 확인하는 중입니다.'
                        : trackedRooms.length === 0 ? '추적 채팅방 탭에서 채팅방을 먼저 등록해 주세요.'
                          : '등록한 채팅방에서 아직 수집된 카카오톡 메시지가 없습니다.'}
              </ThemedText>
            </View>
          }
          ListFooterComponent={messages.length > 0 ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator />
                  <ThemedText type="small" themeColor="textSecondary">이전 메시지를 불러오는 중입니다.</ThemedText>
                </View>
              ) : hasMore ? (
                <Button title="이전 메시지 더 보기" onPress={loadMore} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">저장된 메시지를 모두 불러왔습니다.</ThemedText>
              )}
            </View>
          ) : undefined}
          renderItem={({ item }) => <MessageCard message={item} />}
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
  trackingNotice: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  message: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  roomHeader: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.two },
  room: { flexGrow: 1, flexShrink: 1 },
  messageText: { fontWeight: '400', paddingVertical: Spacing.one },
  error: { gap: Spacing.two },
  empty: { gap: Spacing.three, paddingVertical: Spacing.four },
  footer: { alignItems: 'center', paddingVertical: Spacing.three },
  loadingMore: { alignItems: 'center', gap: Spacing.two },
});
