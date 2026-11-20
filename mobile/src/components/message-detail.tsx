import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FavoriteButton, formatMessageTime } from '@/components/message-card';
import { MessageAction } from '@/components/message-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { useMessageDetail } from '@/hooks/use-message-detail';
import { useTheme } from '@/hooks/use-theme';

export function MessageDetail({ messageId, onClose }: { messageId: number | null; onClose: () => void }) {
  const { available, message, loading, saving, error, refresh, toggleFavorite, supported } = useMessageDetail(messageId);
  const theme = useTheme();

  return (
    <Modal visible={messageId !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
          <View style={[styles.toolbar, { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="메시지 상세 닫기" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <ThemedText style={[styles.closeGlyph, { color: theme.accent }]} accessible={false}>‹</ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>목록</ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">메시지 상세</ThemedText>
            <FavoriteButton selected={Boolean(message?.isFavorite)} pending={saving} disabled={!message || !supported || loading} onPress={() => { void toggleFavorite(); }} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {!available ? (
              <ThemedText type="small" themeColor="textSecondary">메시지 상세는 알림 수집 모듈이 포함된 Android 앱에서 확인해 주세요.</ThemedText>
            ) : !supported ? (
              <ThemedText type="small" themeColor="textSecondary">상세 보기와 즐겨찾기 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.</ThemedText>
            ) : null}
            {loading && <ActivityIndicator color={theme.accent} style={styles.loading} />}
            {error && (
              <View style={styles.notice}>
                <ThemedText type="small" accessibilityRole="alert">{error}</ThemedText>
                {supported && <MessageAction title="다시 불러오기" onPress={() => { void refresh(); }} disabled={loading} />}
              </View>
            )}
            {message && (
              <>
                <View style={styles.heading}>
                  <View style={[styles.roomBadge, { backgroundColor: theme.accentSoft }]}>
                    <ThemedText type="smallBold" selectable style={{ color: theme.accent }}>{message.room}</ThemedText>
                  </View>
                  <ThemedText style={styles.sender} selectable>{message.sender}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatMessageTime(message.timestamp, true)}
                  </ThemedText>
                  <ThemedText style={styles.provenance} themeColor="textSecondary">
                    {message.timestampSource === 'message' ? '메시지 시각' : '알림 시각'} · {message.isGroupChat ? '그룹 채팅' : '1:1 채팅'}{message.isGroupChatSource === 'inferred' ? ' (추정)' : ''}
                  </ThemedText>
                </View>
                <ThemedView type="backgroundElement" style={[styles.bodyCard, { borderColor: theme.border }]}>
                  <ThemedText selectable style={styles.body}>{message.msg}</ThemedText>
                </ThemedView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: message.isFavorite, disabled: saving || !supported }}
                  disabled={saving || !supported}
                  onPress={() => { void toggleFavorite(); }}
                  style={({ pressed }) => [styles.saveAction, { backgroundColor: message.isFavorite ? theme.favoriteSoft : theme.accent }, (pressed || saving) && styles.pressed]}>
                  <ThemedText type="smallBold" style={{ color: message.isFavorite ? theme.favorite : theme.onAccent }}>
                    {saving ? '저장하는 중…' : message.isFavorite ? '★ 즐겨찾기에서 해제' : '☆ 즐겨찾기에 보관'}
                  </ThemedText>
                </Pressable>
              </>
            )}
            {available && supported && !message && !loading && !error && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.loading}>
                표시할 메시지가 없습니다. 삭제되었거나 채팅방 등록이 해제되었을 수 있습니다.
              </ThemedText>
            )}
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  close: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  closeGlyph: { fontSize: 34, lineHeight: 40 },
  content: { paddingHorizontal: 20, paddingTop: 30, gap: 24, paddingBottom: 40 },
  heading: { gap: 8, alignItems: 'flex-start' },
  roomBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, marginBottom: 8, maxWidth: '100%' },
  sender: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
  provenance: { fontSize: 12, lineHeight: 18 },
  bodyCard: { borderWidth: 1, borderRadius: 22, padding: 22 },
  body: { fontSize: 16, lineHeight: 29, fontWeight: '400', letterSpacing: -0.1 },
  saveAction: { minHeight: 52, padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notice: { gap: 12 },
  loading: { marginVertical: 32 },
  pressed: { opacity: 0.55 },
});
