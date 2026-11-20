/** A quiet teal palette for collecting and revisiting conversations. */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#173B3D',
    background: '#F5F8F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EDF8F5',
    textSecondary: '#607573',
    border: '#DCE8E5',
    accent: '#157A7E',
    accentSoft: '#EDF8F5',
    onAccent: '#FFFFFF',
    favorite: '#157A7E',
    favoriteSoft: '#EDF8F5',
  },
  dark: {
    text: '#EDF7F4',
    background: '#101D1F',
    backgroundElement: '#192B2E',
    backgroundSelected: '#233F40',
    textSecondary: '#A4BBB6',
    border: '#30484A',
    accent: '#78D1C7',
    accentSoft: '#233F40',
    onAccent: '#103235',
    favorite: '#78D1C7',
    favoriteSoft: '#233F40',
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
