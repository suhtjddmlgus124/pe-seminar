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
import { useDiscoveredRooms } from '@/hooks/use-discovered-rooms';
import { useTheme } from '@/hooks/use-theme';
import { useTrackedRooms } from '@/hooks/use-tracked-rooms';

export default function TrackedRoomsScreen() {
  const { available, supported, rooms, loading, saving, error, refresh, addRoom, removeRoom } = useTrackedRooms();
  const {
    supported: discoverySupported, rooms: discoveredRooms, loading: discovering,
    error: discoveryError, refresh: refreshDiscovered,
  } = useDiscoveredRooms();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const theme = useTheme();
  const mounted = useRef(false);
  const busy = loading || saving;
  const editable = available && supported && !busy;
  const duplicate = name.trim().length > 0 && rooms.includes(name.trim());
  const canAdd = editable && name.trim().length > 0 && !duplicate;
  const registered = new Set(rooms);
  const candidates = discoveredRooms.filter((room) => !registered.has(room));
  const matchingCandidates = candidates.filter((room) => room.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    void refreshDiscovered();
  }, [refresh, refreshDiscovered]));

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
                알림에서 찾은 카카오톡 채팅방을 선택하거나 이름을 직접 입력해 등록하세요.
                여러 방을 등록할 수 있습니다.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                등록한 이름과 정확히 일치하는 방의 메시지를 표시합니다. 앞뒤 공백은 제거되며,
                이름 안의 공백·기호·대소문자도 일치해야 합니다.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                알림 접근을 허용하면 채팅방 이름을 확인할 수 있는 알림의 메시지를 기기에 저장합니다.
                미등록 방의 메시지도 보관하며, 채팅방을 등록하면 저장해 둔 내용이 표시됩니다.
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

            {available && supported && (
              <View style={styles.section}>
                <ThemedText type="smallBold">알림에서 찾은 채팅방 · {candidates.length}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  알림에서 확인한 채팅방 이름입니다. 원하는 방을 등록하면 이미 저장된 메시지와
                  앞으로 도착하는 메시지를 메시지 탭에서 볼 수 있습니다.
                </ThemedText>
                {!discoverySupported ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    알림에서 찾은 채팅방을 선택하려면 새 Android 앱을 설치해 주세요.
                    아래에서 이름을 직접 입력해 등록할 수도 있습니다.
                  </ThemedText>
                ) : (
                  <>
                    {candidates.length > 0 && (
                      <TextInput
                        accessibilityLabel="알림에서 찾은 채팅방 검색"
                        placeholder="채팅방 이름 검색"
                        placeholderTextColor={theme.textSecondary}
                        value={search}
                        onChangeText={(value) => { setSearch(value); setVisibleCount(10); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        underlineColorAndroid="transparent"
                        style={[
                          styles.input,
                          { color: theme.text, backgroundColor: theme.background, borderColor: theme.textSecondary },
                        ]}
                      />
                    )}
                    {matchingCandidates.slice(0, visibleCount).map((room) => (
                      <ThemedView type="backgroundElement" key={room} style={styles.roomRow}>
                        <ThemedText selectable style={styles.roomName}>{room}</ThemedText>
                        <Button
                          title="등록"
                          accessibilityLabel={`${room} 추적 등록`}
                          onPress={() => { if (editable) void addRoom(room); }}
                          disabled={!editable}
                        />
                      </ThemedView>
                    ))}
                    {matchingCandidates.length > visibleCount && (
                      <Button title="채팅방 더 보기" onPress={() => setVisibleCount((count) => count + 10)} />
                    )}
                    {discovering && (
                      <View style={styles.progress}>
                        <ActivityIndicator color={theme.textSecondary} />
                        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                          알림에서 찾은 채팅방을 불러오는 중입니다.
                        </ThemedText>
                      </View>
                    )}
                    {discoveryError && <ThemedText accessibilityRole="alert">{discoveryError}</ThemedText>}
                    {!discovering && !discoveryError && candidates.length === 0 && (
                      <ThemedView type="backgroundElement" style={styles.card}>
                        <ThemedText>새로 등록할 채팅방이 없습니다.</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          알림 접근을 허용한 뒤 카카오톡 알림을 받으면, 이름을 확인할 수 있는
                          채팅방이 여기에 나타납니다. 이미 등록한 방은 표시하지 않습니다.
                        </ThemedText>
                      </ThemedView>
                    )}
                    {candidates.length > 0 && matchingCandidates.length === 0 && (
                      <ThemedText type="small" themeColor="textSecondary">검색한 이름의 채팅방이 없습니다.</ThemedText>
                    )}
                    <Button
                      title={discoveryError ? '발견한 채팅방 다시 불러오기' : '발견한 채팅방 새로고침'}
                      onPress={() => { void refreshDiscovered(); }}
                      disabled={discovering}
                    />
                  </>
                )}
              </View>
            )}

            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">이름 직접 입력</ThemedText>
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
                    title="등록 해제"
                    accessibilityLabel={`${room} 등록 해제 및 메시지 숨기기`}
                    onPress={() => { void removeRoom(room); }}
                    disabled={!editable}
                  />
                </ThemedView>
              ))}
              {rooms.length === 0 && !loading && available && supported && !error && (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText>등록한 채팅방이 없습니다.</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    채팅방을 등록하면 알림에서 저장해 둔 메시지를 볼 수 있습니다.
                  </ThemedText>
                </ThemedView>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                등록을 해제하면 메시지 목록에서만 숨깁니다. 메시지 저장은 계속되며,
                다시 등록하면 보관한 기록을 볼 수 있습니다. 수집을 중지하려면 알림 접근 권한을 해제하세요.
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
