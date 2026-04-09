// src/store/inboxStore.ts
// Tracks unread inbox count for the tab bar badge.
// Updated whenever the Notifications screen loads or a push arrives.
import { create } from 'zustand'

interface InboxState {
    unreadCount: number
    setUnreadCount: (n: number) => void
    increment: () => void
    clear: () => void
}

export const useInboxStore = create<InboxState>((set) => ({
    unreadCount: 0,
    setUnreadCount: (n) => set({ unreadCount: n }),
    increment: () => set(s => ({ unreadCount: s.unreadCount + 1 })),
    clear: () => set({ unreadCount: 0 }),
}))