import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      indicatorColor={colors.accentSoft}
      tintColor={colors.accent}
      iconColor={{ default: colors.textSecondary, selected: colors.accent }}
      labelStyle={{ default: { color: colors.textSecondary, fontSize: 12 }, selected: { color: colors.accent, fontWeight: '600' } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>메시지</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }}
          md="chat_bubble_outline"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="favorites">
        <NativeTabs.Trigger.Label>즐겨찾기</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'star', selected: 'star.fill' }} md="star" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tracked-rooms">
        <NativeTabs.Trigger.Label>채팅방 추가</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="plus.bubble"
          md="add_comment"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore" hidden />
    </NativeTabs>
  );
}
