import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageCard } from '@/components/message-card';
import { MessageDetail } from '@/components/message-detail';
import { MessageAction, MessageEmpty, MessageError, MessageListFooter } from '@/components/message-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useKakaoMessages } from '@/hooks/use-kakao-messages';
import { useTheme } from '@/hooks/use-theme';
import type { KakaoMessage } from '@/modules/notification-listener';

export default function HomeScreen() {
  const {
    available, granted, messages, refreshing, loadingMore, hasMore,
    error, refresh, loadMore, openSettings, trackedRooms, trackingLoading,
    favoritesSupported, favoritePendingIds, toggleFavorite,
  } = useKakaoMessages();
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [collapsedRooms, setCollapsedRooms] = useState<ReadonlySet<string>>(new Set());
  const theme = useTheme();
  const toggleRoom = useCallback((room: string) => {
    setCollapsedRooms((previous) => {
      const next = new Set(previous);
      if (next.has(room)) next.delete(room);
      else next.add(room);
      return next;
    });
  }, []);
  const sections = useMemo(() => {
    const rooms = new Map<string, KakaoMessage[]>();
    for (const message of messages) {
      const room = rooms.get(message.room) ?? [];
      room.push(message);
      rooms.set(message.room, room);
    }
    // Incoming messages are newest first, so rooms with the latest activity appear first.
    return [...rooms].map(([title, data]) => ({
      key: title,
      title,
      collapsed: collapsedRooms.has(title),
      data: collapsedRooms.has(title) ? [] : data,
    }));
  }, [messages, collapsedRooms]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.messageId)}
          extraData={favoritePendingIds}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshing={refreshing}
          onRefresh={available ? () => { void refresh(); } : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headingRow}>
                <View style={styles.heading}>
                  <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>talkreminder</ThemedText>
                  <ThemedText style={styles.title}>메시지</ThemedText>
                </View>
                <Link href="./tracked-rooms" asChild>
                  <Pressable accessibilityRole="link" accessibilityLabel="채팅방 추가" style={({ pressed }) => [styles.addButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
                    <ThemedText style={[styles.plus, { color: theme.onAccent }]}>＋</ThemedText>
                  </Pressable>
                </Link>
              </View>
              <ThemedText type="small" themeColor="textSecondary">채팅방별로 모아 보고, 중요한 메시지는 별표로 보관하세요.</ThemedText>
              {available ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="알림 수집 설정"
                    accessibilityState={{ expanded: showSettings || !granted }}
                    onPress={() => setShowSettings((shown) => !shown)}
                    style={[styles.status, { borderColor: theme.border, backgroundColor: theme.accentSoft }]}>
                    <View style={[styles.statusDot, { backgroundColor: granted ? theme.accent : theme.favorite }]} />
                    <ThemedText style={styles.statusText} themeColor="text">
                      {trackingLoading ? '채팅방 확인 중' : granted ? `알림 수집 중 · ${trackedRooms.length}개 채팅방 등록` : '알림 접근 권한이 필요해요'}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.chevron}>{showSettings || !granted ? '⌃' : '⌄'}</ThemedText>
                  </Pressable>
                  {(showSettings || !granted) && (
                    <ThemedView type="backgroundElement" style={[styles.settings, { borderColor: theme.border }]}>
                      <ThemedText type="small" themeColor="textSecondary">
                        알림 접근을 허용하면 미등록 방의 메시지도 기기에 저장합니다. 등록한 방의 메시지만 이 목록에 표시합니다.
                      </ThemedText>
                      <MessageAction title="알림 접근 설정 열기" onPress={openSettings} />
                    </ThemedView>
                  )}
                  {!favoritesSupported && (
                    <ThemedText type="small" themeColor="textSecondary">
                      상세 보기와 즐겨찾기를 사용하려면 새 Android 개발 빌드를 설치해 주세요.
                    </ThemedText>
                  )}
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">메시지 수집은 Android 앱에서 사용할 수 있습니다.</ThemedText>
              )}
              {error && <MessageError error={error} onRetry={() => { void refresh(); }} disabled={refreshing} />}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${section.title} 메시지 ${section.collapsed ? '펼치기' : '접기'}`}
              accessibilityState={{ expanded: !section.collapsed }}
              onPress={() => toggleRoom(section.title)}
              style={({ pressed }) => [styles.sectionHeading, section.collapsed && { backgroundColor: theme.accentSoft }, pressed && styles.pressed]}>
              <View style={[styles.sectionMark, { backgroundColor: theme.accent }]} />
              <ThemedText style={styles.sectionTitle} numberOfLines={2}>{section.title}</ThemedText>
              <ThemedText accessible={false} themeColor="accent" style={styles.sectionChevron}>
                {section.collapsed ? '▸' : '▾'}
              </ThemedText>
            </Pressable>
          )}
          renderSectionFooter={() => <View style={styles.sectionGap} />}
          renderItem={({ item }) => (
            <MessageCard
              message={item}
              onPress={() => setSelectedMessageId(item.messageId)}
              onToggleFavorite={() => { void toggleFavorite(item); }}
              favoritePending={favoritePendingIds.has(item.messageId)}
              favoritesSupported={favoritesSupported}
            />
          )}
          ListEmptyComponent={
            <MessageEmpty
              loading={refreshing || trackingLoading}
              title={refreshing || trackingLoading ? '메시지를 불러오고 있어요' : error ? '메시지를 불러오지 못했어요' : !available ? 'Android 앱에서 만나요' : trackedRooms.length === 0 ? '첫 채팅방을 추가해 보세요' : '아직 도착한 메시지가 없어요'}
              description={!available ? '알림 수집 모듈이 포함된 개발용 앱을 열어 주세요.' : trackedRooms.length === 0 ? '채팅방 추가 탭에서 방을 고르면 저장해 둔 메시지가 나타납니다.' : '카카오톡 알림이 오면 이곳에 차곡차곡 모입니다.'}
            />
          }
          ListFooterComponent={messages.length > 0 ? <MessageListFooter loading={loadingMore} hasMore={hasMore} onLoadMore={loadMore} /> : undefined}
        />
        <MessageDetail messageId={selectedMessageId} onClose={() => setSelectedMessageId(null)} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  list: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: BottomTabInset + 24 },
  header: { gap: 16, marginBottom: 24 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  heading: { gap: 6 },
  eyebrow: { fontSize: 12, lineHeight: 18, letterSpacing: 0.4, fontWeight: '700' },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -1 },
  addButton: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plus: { fontSize: 27, lineHeight: 34 },
  status: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  chevron: { fontSize: 20, lineHeight: 24 },
  settings: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 12, paddingHorizontal: 8, marginBottom: 8, borderRadius: 14 },
  sectionMark: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  sectionChevron: { width: 24, fontSize: 20, lineHeight: 24, textAlign: 'center' },
  sectionGap: { height: 20 },
  pressed: { opacity: 0.6 },
});
