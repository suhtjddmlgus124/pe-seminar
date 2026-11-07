import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrackedRooms } from '@/hooks/use-tracked-rooms';

export default function TrackedRoomsScreen() {
  const { available, supported, rooms, loading, saving, error, refresh, addRoom, removeRoom } = useTrackedRooms();
  const [name, setName] = useState('');
  const theme = useTheme();
  const mounted = useRef(false);
  const busy = loading || saving;
  const editable = available && supported && !busy;
  const duplicate = name.trim().length > 0 && rooms.includes(name.trim());
  const canAdd = editable && name.trim().length > 0 && !duplicate;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const submitRoom = () => {
    if (!canAdd) return;
    void addRoom(name).then((added) => {
      if (added && mounted.current) setName('');
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={Platform.OS !== 'web'}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets>
            <View style={styles.section}>
              <ThemedText type="subtitle">추적 채팅방</ThemedText>
              <ThemedText themeColor="textSecondary">
                추적할 카카오톡 채팅방 이름을 등록하세요. 여러 방을 등록할 수 있습니다.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                저장한 이름과 정확히 일치하는 방만 수집합니다. 앞뒤 공백은 제거되며,
                이름 안의 공백·기호·대소문자도 일치해야 합니다.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                등록 후 도착하는 새 알림부터 추적합니다. Android에서 채팅방 이름을 확인할 수 있는
                알림만 수집합니다. 발신자 이름을 채팅방 이름으로 대신 사용하지 않습니다.
              </ThemedText>
            </View>

            {!available ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Android 앱에서 사용할 수 있습니다.</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  알림 수집 모듈이 포함된 Android 앱에서 추적 채팅방을 등록해 주세요.
                </ThemedText>
              </ThemedView>
            ) : !supported ? (
              <ThemedText accessibilityRole="alert">
                추적 채팅방 기능이 포함된 새 Android 개발 빌드를 설치해 주세요.
              </ThemedText>
            ) : undefined}

            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">채팅방 이름</ThemedText>
              <TextInput
                accessibilityLabel="추적할 카카오톡 채팅방 이름"
                accessibilityHint="카카오톡에 표시되는 채팅방 이름을 정확히 입력해 주세요."
                placeholder="예: 와플스튜디오 공지방"
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={setName}
                editable={editable}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={submitRoom}
                underlineColorAndroid="transparent"
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.background, borderColor: theme.textSecondary },
                  !editable && styles.disabled,
                ]}
              />
              {duplicate && (
                <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                  이미 등록한 채팅방입니다.
                </ThemedText>
              )}
              <Button title="채팅방 등록" disabled={!canAdd} onPress={submitRoom} />
            </ThemedView>

            {error && (
              <View style={styles.section}>
                <ThemedText accessibilityRole="alert">{error}</ThemedText>
                {available && supported && (
                  <Button title="다시 불러오기" onPress={() => { void refresh(); }} disabled={busy} />
                )}
              </View>
            )}

            {(loading || saving) && (
              <View style={styles.progress}>
                <ActivityIndicator color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                  {saving ? '변경 내용을 저장하는 중입니다.' : '추적 채팅방을 불러오는 중입니다.'}
                </ThemedText>
              </View>
            )}

            <View style={styles.section}>
              <ThemedText type="smallBold">등록한 채팅방 · {rooms.length}</ThemedText>
              {rooms.map((room) => (
                <ThemedView type="backgroundElement" key={room} style={styles.roomRow}>
                  <ThemedText selectable style={styles.roomName}>{room}</ThemedText>
                  <Button
                    title="삭제"
                    accessibilityLabel={`${room} 추적 중단`}
                    onPress={() => { void removeRoom(room); }}
                    disabled={!editable}
                  />
                </ThemedView>
              ))}
              {rooms.length === 0 && !loading && available && supported && !error && (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText>등록한 채팅방이 없습니다.</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    채팅방을 등록하기 전까지 새 메시지를 수집하지 않습니다.
                  </ThemedText>
                </ThemedView>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                채팅방을 삭제하면 이후 추적만 중단합니다. 기존에 저장한 메시지 기록은 삭제되지 않습니다.
              </ThemedText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  keyboardArea: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.four },
  section: { gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, fontSize: 16 },
  disabled: { opacity: 0.5 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  roomRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three,
    padding: Spacing.three, borderRadius: Spacing.three,
  },
  roomName: { flex: 1 },
});
