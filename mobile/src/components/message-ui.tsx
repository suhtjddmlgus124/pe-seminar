import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

export function MessageAction({ title, onPress, disabled = false }: {
  title: string; onPress: () => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: theme.accentSoft }, (pressed || disabled) && styles.dimmed]}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>{title}</ThemedText>
    </Pressable>
  );
}

export function MessageEmpty({ title, description, loading = false, favorite = false }: {
  title: string; description?: string; loading?: boolean; favorite?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: favorite ? theme.favoriteSoft : theme.accentSoft }]}>
        {loading ? <ActivityIndicator color={theme.accent} /> : (
          <ThemedText style={[styles.emptyGlyph, { color: favorite ? theme.favorite : theme.accent }]}>{favorite ? '☆' : '≡'}</ThemedText>
        )}
      </View>
      <ThemedText type="smallBold" style={styles.center}>{title}</ThemedText>
      {description && <ThemedText type="small" themeColor="textSecondary" style={styles.center}>{description}</ThemedText>}
    </View>
  );
}

export function MessageError({ error, onRetry, disabled = false }: {
  error: string; onRetry: () => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.error, { borderColor: theme.border }]}>
      <ThemedText type="small" accessibilityRole="alert">{error}</ThemedText>
      <MessageAction title="다시 불러오기" onPress={onRetry} disabled={disabled} />
    </ThemedView>
  );
}

export function MessageListFooter({ loading, hasMore, onLoadMore }: {
  loading: boolean; hasMore: boolean; onLoadMore: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.footer}>
      {loading ? <ActivityIndicator color={theme.accent} /> : hasMore ? (
        <MessageAction title="이전 메시지 더 보기" onPress={onLoadMore} />
      ) : <ThemedText style={styles.end} themeColor="textSecondary">여기까지 모두 확인했어요</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 64 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyGlyph: { fontSize: 34, lineHeight: 42 },
  center: { textAlign: 'center' },
  error: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 12 },
  footer: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  end: { fontSize: 12, lineHeight: 18 },
});
