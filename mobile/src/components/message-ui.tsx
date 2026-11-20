import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

export function MessageAction({ title, onPress, disabled = false, variant = 'soft', accessibilityLabel }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'soft' | 'primary' | 'quiet';
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const backgroundColor = variant === 'primary' ? theme.accent : variant === 'soft' ? theme.accentSoft : 'transparent';
  const color = variant === 'primary' ? theme.onAccent : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor }, (pressed || disabled) && styles.dimmed]}>
      <ThemedText type="smallBold" style={[styles.actionLabel, { color }]}>{title}</ThemedText>
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
          favorite ? <ThemedText accessible={false} style={[styles.emptyGlyph, { color: theme.favorite }]}>☆</ThemedText> : (
            <View accessible={false} style={[styles.emptyBubble, { borderColor: theme.accent }]}>
              <View style={[styles.emptyLine, { backgroundColor: theme.accent }]} />
              <View style={[styles.emptyLine, styles.shortLine, { backgroundColor: theme.accent }]} />
            </View>
          )
        )}
      </View>
      <ThemedText type="smallBold" style={[styles.center, styles.emptyTitle]}>{title}</ThemedText>
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
  action: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { textAlign: 'center', letterSpacing: -0.2 },
  dimmed: { opacity: 0.5 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 60 },
  emptyIcon: { width: 76, height: 76, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyGlyph: { fontSize: 36, lineHeight: 44 },
  emptyBubble: { width: 34, height: 28, borderWidth: 2, borderRadius: 9, borderBottomLeftRadius: 2, padding: 6, gap: 4, justifyContent: 'center' },
  emptyLine: { height: 2, borderRadius: 1, width: '100%' },
  shortLine: { width: '65%' },
  emptyTitle: { fontSize: 16, lineHeight: 24, letterSpacing: -0.3 },
  center: { textAlign: 'center' },
  error: { padding: 18, borderWidth: 1, borderRadius: 18, gap: 14 },
  footer: { alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  end: { fontSize: 12, lineHeight: 18 },
});
