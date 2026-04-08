// src/store/themeStore.ts
// Manages light/dark mode preference, persisted to AsyncStorage.
import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
    mode: ThemeMode
    isLoaded: boolean
    toggle: () => Promise<void>
    setMode: (mode: ThemeMode) => Promise<void>
    load: () => Promise<void>
}

const THEME_KEY = 'cashflow:theme'

export const useThemeStore = create<ThemeState>((set, get) => ({
    mode: 'light',
    isLoaded: false,

    load: async () => {
        try {
            const saved = await AsyncStorage.getItem(THEME_KEY)
            if (saved === 'dark' || saved === 'light') {
                set({ mode: saved, isLoaded: true })
            } else {
                set({ isLoaded: true })
            }
        } catch {
            set({ isLoaded: true })
        }
    },

    toggle: async () => {
        const next: ThemeMode = get().mode === 'light' ? 'dark' : 'light'
        set({ mode: next })
        await AsyncStorage.setItem(THEME_KEY, next)
    },

    setMode: async (mode) => {
        set({ mode })
        await AsyncStorage.setItem(THEME_KEY, mode)
    },
}))

// ─── Theme tokens ───────────────────────────────────────────
export const LIGHT_THEME = {
    background: '#F5F7FF',
    surface: '#FFFFFF',
    surfaceSecondary: '#F0F2FF',
    text: '#0D0F1C',
    textSecondary: '#6B7280',
    textTertiary: '#A0A8BA',
    border: '#E8EAF6',
    borderDark: '#D1D5F0',
    card: '#FFFFFF',
    headerBg: '#F5F7FF',
    tabBarBg: '#FFFFFF',
    inputBg: '#F5F7FF',
    overlay: 'rgba(13,15,28,0.55)',
}

export const DARK_THEME = {
    background: '#0D0F1C',
    surface: '#161929',
    surfaceSecondary: '#1E2235',
    text: '#F1F3FF',
    textSecondary: '#8B92B3',
    textTertiary: '#4B5173',
    border: '#252840',
    borderDark: '#2E3154',
    card: '#161929',
    headerBg: '#0D0F1C',
    tabBarBg: '#161929',
    inputBg: '#1E2235',
    overlay: 'rgba(0,0,0,0.7)',
}

export type ThemeTokens = typeof LIGHT_THEME

export function getTheme(mode: ThemeMode): ThemeTokens {
    return mode === 'dark' ? DARK_THEME : LIGHT_THEME
}