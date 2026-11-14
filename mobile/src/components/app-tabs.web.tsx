import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

// Expo Router's slot ref still targets View; use the rendered Pressable's ref type.
type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'> &
  Pick<ComponentProps<typeof Pressable>, 'ref'>;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%', paddingBottom: 84 }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>메시지</TabButton>
          </TabTrigger>
          <TabTrigger name="favorites" href="./favorites" asChild>
            <TabButton>즐겨찾기</TabButton>
          </TabTrigger>
          <TabTrigger name="tracked-rooms" href="./tracked-rooms" asChild>
            <TabButton>채팅방 추가</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabButtonProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" numberOfLines={1} style={styles.tabLabel} themeColor={isFocused ? 'accent' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  tabButton: { flex: 1 },
  tabLabel: { fontSize: 12, lineHeight: 18 },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
