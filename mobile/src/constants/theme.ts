/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#242130',
    background: '#F7F6FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEE9FA',
    textSecondary: '#777181',
    border: '#E9E5EF',
    accent: '#7057AD',
    accentSoft: '#EEE9FA',
    favorite: '#946500',
    favoriteSoft: '#FFF4CF',
  },
  dark: {
    text: '#F3EFF8',
    background: '#17151D',
    backgroundElement: '#23202C',
    backgroundSelected: '#352C49',
    textSecondary: '#AFA7BC',
    border: '#393242',
    accent: '#C1AAEF',
    accentSoft: '#352C49',
    favorite: '#F1C552',
    favoriteSoft: '#3C321C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
