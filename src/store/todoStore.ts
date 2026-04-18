// src/store/todoStore.ts
// Offline-only todo store. All data lives in AsyncStorage on-device.
// Supports: priority, due date, reminder time, notes.
// Reminder scheduling is handled by the caller (TodoScreen) using notificationService.

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
    dueDate: string | null    // ISO date for the due date badge
    reminderDate: string | null    // ISO datetime for push notification
    reminderNoteId: string | null    // expo notification ID for the 5-min warning
    reminderDueId: string | null    // expo notification ID for the "still pending" alert
    notes: string | null
}

interface TodoState {
    todos: Todo[]
    filter: FilterMode
    searchQuery: string
    isLoaded: boolean

    load: () => Promise<void>
    addTodo: (text: string, priority?: Priority, dueDate?: string | null, reminderDate?: string | null) => Promise<Todo>
    toggleTodo: (id: string) => Promise<void>
    updateTodo: (id: string, updates: Partial<Pick<Todo, 'text' | 'priority' | 'dueDate' | 'reminderDate' | 'reminderNoteId' | 'reminderDueId' | 'notes'>>) => Promise<void>
    deleteTodo: (id: string) => Promise<void>
    clearCompleted: () => Promise<void>
    setFilter: (f: FilterMode) => void
    setSearchQuery: (q: string) => void
    filteredTodos: () => Todo[]
    stats: () => { total: number; completed: number; active: number; high: number }
}

const STORAGE_KEY = 'cashflow:todos_v2'

async function persist(todos: Todo[]) {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos)) } catch { }
}

function genId() {
    return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export const useTodoStore = create<TodoState>((set, get) => ({
    todos: [], filter: 'all', searchQuery: '', isLoaded: false,

    load: async () => {
        try {
            // Try new key first, fall back to old key for migration
            let raw = await AsyncStorage.getItem(STORAGE_KEY)
            if (!raw) raw = await AsyncStorage.getItem('cashflow:todos')
            const todos: Todo[] = raw ? JSON.parse(raw) : []
            // Migrate: add reminderDate/reminderNoteId/reminderDueId if missing
            const migrated = todos.map(t => ({
                reminderDate: null, reminderNoteId: null, reminderDueId: null,
                ...t,
            }))
            set({ todos: migrated, isLoaded: true })
            if (raw) await persist(migrated) // save migrated version
        } catch {
            set({ isLoaded: true })
        }
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

    filteredTodos: () => {
        const { todos, filter, searchQuery } = get()
        let result = todos
        if (filter === 'active') result = result.filter(t => !t.completed)
        if (filter === 'completed') result = result.filter(t => t.completed)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter(t => t.text.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q))
        }
        return result.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1
            const p = { high: 0, medium: 1, low: 2 }
            return p[a.priority] - p[b.priority]
        })
    },

    stats: () => {
        const t = get().todos
        return {
            total: t.length,
            completed: t.filter(x => x.completed).length,
            active: t.filter(x => !x.completed).length,
            high: t.filter(x => x.priority === 'high' && !x.completed).length,
        }
    },
}))