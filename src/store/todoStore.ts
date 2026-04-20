// src/store/todoStore.ts
// Offline-only todo store. All data lives in AsyncStorage on-device.
//
// USER-SPECIFIC STORAGE: Todos are keyed by userId so each user keeps
// their own todos across logout/login cycles. The in-memory store is
// reset on logout but AsyncStorage data persists. When the same user
// logs back in, their todos are restored from AsyncStorage.

import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type Priority = 'high' | 'medium' | 'low'
export type FilterMode = 'all' | 'active' | 'completed'

export interface Todo {
    id: string
    text: string
    completed: boolean
    priority: Priority
    createdAt: string
    completedAt: string | null
    dueDate: string | null    // ISO date for due badge
    reminderDate: string | null    // ISO datetime for push reminder
    reminderNoteId: string | null    // Expo notification ID (5-min warning)
    reminderDueId: string | null    // Expo notification ID (pending alert)
    notes: string | null
}

interface TodoState {
    todos: Todo[]
    filter: FilterMode
    searchQuery: string
    isLoaded: boolean

    load: (userId?: string) => Promise<void>
    reset: () => void
    addTodo: (text: string, priority?: Priority, dueDate?: string | null, reminderDate?: string | null) => Promise<Todo>
    toggleTodo: (id: string) => Promise<void>
    updateTodo: (id: string, updates: Partial<Pick<Todo, 'text' | 'priority' | 'dueDate' | 'reminderDate' | 'reminderNoteId' | 'reminderDueId' | 'notes'>>) => Promise<void>
    deleteTodo: (id: string) => Promise<void>
    clearCompleted: () => Promise<void>
    setFilter: (f: FilterMode) => void
    setSearchQuery: (q: string) => void
}

// User-specific key: cashflow:todos:v2:{userId}
// Falls back to anonymous key for unauthenticated use
const storageKey = (userId?: string) =>
    userId ? `cashflow:todos:v2:${userId}` : 'cashflow:todos:v2:anonymous'

// Keep track of current user's key for persist calls
let _currentKey = storageKey()

async function persist(todos: Todo[]) {
    try {
        await AsyncStorage.setItem(_currentKey, JSON.stringify(todos))
    } catch { }
}

function genId() {
    return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// Migrate old generic keys → user-specific keys
async function migrateOldTodos(userId: string): Promise<Todo[]> {
    const OLD_KEYS = ['cashflow:todos', 'cashflow:todos_v2']
    for (const key of OLD_KEYS) {
        try {
            const raw = await AsyncStorage.getItem(key)
            if (raw) {
                const todos: Todo[] = JSON.parse(raw)
                if (todos.length > 0) {
                    // Move to user-specific key
                    await AsyncStorage.setItem(storageKey(userId), raw)
                    await AsyncStorage.removeItem(key)
                    return todos
                }
            }
        } catch { }
    }
    return []
}

export const useTodoStore = create<TodoState>((set, get) => ({
    todos: [],
    filter: 'all',
    searchQuery: '',
    isLoaded: false,

    load: async (userId?: string) => {
        try {
            _currentKey = storageKey(userId)
            let raw = await AsyncStorage.getItem(_currentKey)

            let todos: Todo[] = []
            if (raw) {
                todos = JSON.parse(raw)
            } else if (userId) {
                // First login for this user — check for old generic todos to migrate
                todos = await migrateOldTodos(userId)
            }

            // Migrate: add new fields if missing from older data
            const migrated = todos.map(t => ({
                reminderDate: null,
                reminderNoteId: null,
                reminderDueId: null,
                notes: null,
                ...t,
            }))

            set({ todos: migrated, isLoaded: true })
            if (migrated.length > 0) await persist(migrated)
        } catch {
            set({ isLoaded: true })
        }
    },

    // Called on logout — clears in-memory state but keeps AsyncStorage intact
    // so todos are restored when user logs back in
    reset: () => {
        set({ todos: [], filter: 'all', searchQuery: '', isLoaded: false })
        _currentKey = storageKey() // reset to anonymous key
    },

    addTodo: async (text, priority = 'medium', dueDate = null, reminderDate = null) => {
        const todo: Todo = {
            id: genId(), text: text.trim(), completed: false, priority,
            createdAt: new Date().toISOString(), completedAt: null,
            dueDate, reminderDate, reminderNoteId: null, reminderDueId: null, notes: null,
        }
        const next = [todo, ...get().todos]
        set({ todos: next })
        await persist(next)
        return todo
    },

    toggleTodo: async (id) => {
        const next = get().todos.map(t =>
            t.id === id
                ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : null }
                : t
        )
        set({ todos: next })
        await persist(next)
    },

    updateTodo: async (id, updates) => {
        const next = get().todos.map(t => t.id === id ? { ...t, ...updates } : t)
        set({ todos: next })
        await persist(next)
    },

    deleteTodo: async (id) => {
        const next = get().todos.filter(t => t.id !== id)
        set({ todos: next })
        await persist(next)
    },

    clearCompleted: async () => {
        const next = get().todos.filter(t => !t.completed)
        set({ todos: next })
        await persist(next)
    },

    setFilter: (filter) => set({ filter }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
}))