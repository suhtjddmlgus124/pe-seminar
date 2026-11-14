import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageCard } from '@/components/message-card';
import { MessageDetail } from '@/components/message-detail';
import { MessageEmpty, MessageError, MessageListFooter } from '@/components/message-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useFavoriteMessages } from '@/hooks/use-favorite-messages';
import { useTheme } from '@/hooks/use-theme';

export default function FavoritesScreen() {
  const {
    available, supported, messages, refreshing, loadingMore, hasMore, error,
    refresh, loadMore, favoritePendingIds, toggleFavorite,
  } = useFavoriteMessages();
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const theme = useTheme();

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.messageId)}
          extraData={favoritePendingIds}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={available && supported ? () => { void refresh(); } : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headingRow}>
                <View style={styles.heading}>
                  <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>SAVED MESSAGES</ThemedText>
                  <ThemedText style={styles.title}>즐겨찾기</ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.favoriteSoft }]}>
                  <ThemedText style={[styles.star, { color: theme.favorite }]} accessible={false}>★</ThemedText>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary">다시 보고 싶은 메시지만 한곳에 모았어요.</ThemedText>
              {available && supported && (
                <ThemedText style={styles.note} themeColor="textSecondary">채팅방 등록을 해제해도 별표한 메시지는 여기에 남습니다.</ThemedText>
              )}
              {error && <MessageError error={error} onRetry={() => { void refresh(); }} disabled={refreshing} />}
            </View>
          }
          renderItem={({ item }) => (
            <MessageCard
              message={item}
              showRoom
              onPress={() => setSelectedMessageId(item.messageId)}
              onToggleFavorite={() => { void toggleFavorite(item); }}
              favoritePending={favoritePendingIds.has(item.messageId)}
              favoritesSupported={supported}
            />
          )}
          ListEmptyComponent={
            <MessageEmpty
              favorite
              loading={refreshing}
              title={refreshing ? '즐겨찾기를 불러오고 있어요' : !available ? 'Android 앱에서 만나요' : !supported ? '새 개발 빌드가 필요해요' : error ? '즐겨찾기를 불러오지 못했어요' : '아직 별표한 메시지가 없어요'}
              description={!available ? '즐겨찾기는 Android 앱에 저장됩니다.' : !supported ? '즐겨찾기 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.' : '메시지 카드나 상세 화면에서 ☆를 눌러 보관해 보세요.'}
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
  list: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: BottomTabInset + 24 },
  header: { gap: 14, marginBottom: 24 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  heading: { gap: 4 },
  eyebrow: { fontSize: 11, lineHeight: 16, letterSpacing: 1.6, fontWeight: '800' },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 },
  badge: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 28, lineHeight: 36 },
  note: { fontSize: 12, lineHeight: 18 },
});
