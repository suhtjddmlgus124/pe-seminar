import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import type { KakaoMessage } from '@/modules/notification-listener';

export function formatMessageTime(timestamp: number, full = false): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '시각 확인 불가';
  return date.toLocaleString('ko-KR', full ? {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  } : {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

type MessageCardProps = {
  message: KakaoMessage;
  onPress: () => void;
  onToggleFavorite: () => void;
  favoritePending?: boolean;
  favoritesSupported: boolean;
  showRoom?: boolean;
};

export function FavoriteButton({
  selected, pending, disabled, onPress, label,
}: {
  selected: boolean;
  pending?: boolean;
  disabled?: boolean;
  onPress: () => void;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (selected ? '즐겨찾기 해제' : '즐겨찾기에 추가')}
      accessibilityState={{ selected, disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.favoriteButton,
        selected && { backgroundColor: theme.favoriteSoft },
        (disabled || pending) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {pending ? <ActivityIndicator size="small" color={theme.favorite} /> : (
        <ThemedText
          accessible={false}
          style={[styles.star, { color: selected ? theme.favorite : theme.textSecondary }]}>
          {selected ? '★' : '☆'}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function MessageCard({
  message, onPress, onToggleFavorite, favoritePending, favoritesSupported, showRoom = false,
}: MessageCardProps) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.card, { borderColor: theme.border }]} type="backgroundElement">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${message.room}, ${message.sender}: ${message.msg}`}
        accessibilityHint="메시지 전체 내용을 엽니다."
        onPress={onPress}
        style={({ pressed }) => [styles.content, pressed && styles.pressed]}>
        {showRoom && <ThemedText numberOfLines={1} style={[styles.room, { color: theme.accent }]}>{message.room}</ThemedText>}
        <ThemedText numberOfLines={2} ellipsizeMode="tail" style={styles.preview}>
          {message.msg.replace(/\s+/g, ' ').trim()}
        </ThemedText>
        <View style={styles.metadata}>
          <ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.sender}>{message.sender}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.time}>{formatMessageTime(message.timestamp)}</ThemedText>
        </View>
      </Pressable>
      <View style={styles.favoriteArea}>
        <FavoriteButton
          selected={Boolean(message.isFavorite)}
          pending={favoritePending}
          disabled={!favoritesSupported}
          onPress={onToggleFavorite}
          label={`${message.sender}의 메시지 ${message.isFavorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}`}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  content: { flex: 1, minWidth: 0, padding: 14, gap: 7, justifyContent: 'center', minHeight: 86 },
  preview: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  room: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  metadata: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sender: { fontSize: 11, lineHeight: 16, flex: 1 },
  time: { fontSize: 11, lineHeight: 16 },
  favoriteArea: { justifyContent: 'center', paddingRight: 6 },
  favoriteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  star: { fontSize: 26, lineHeight: 32, fontWeight: '400' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
});
