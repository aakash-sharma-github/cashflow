// src/store/todoStore.ts
// Offline-only todo store. All data lives in AsyncStorage on-device.
// No server sync — todos are personal and private.

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
    dueDate: string | null      // ISO date string or null
    notes: string | null
}

interface TodoState {
    todos: Todo[]
    filter: FilterMode
    searchQuery: string
    isLoaded: boolean

    // Actions
    load: () => Promise<void>
    addTodo: (text: string, priority?: Priority, dueDate?: string | null) => Promise<void>
    toggleTodo: (id: string) => Promise<void>
    updateTodo: (id: string, updates: Partial<Pick<Todo, 'text' | 'priority' | 'dueDate' | 'notes'>>) => Promise<void>
    deleteTodo: (id: string) => Promise<void>
    clearCompleted: () => Promise<void>
    reorderTodos: (from: number, to: number) => Promise<void>
    setFilter: (f: FilterMode) => void
    setSearchQuery: (q: string) => void

    // Computed selectors (return values, not state)
    filteredTodos: () => Todo[]
    stats: () => { total: number; completed: number; active: number; high: number }
}

const STORAGE_KEY = 'cashflow:todos'

async function persist(todos: Todo[]) {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
    } catch (e) {
        console.warn('[Todos] persist failed:', e)
    }
}

function genId() {
    return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export const useTodoStore = create<TodoState>((set, get) => ({
    todos: [],
    filter: 'all',
    searchQuery: '',
    isLoaded: false,

    load: async () => {
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY)
            const todos: Todo[] = raw ? JSON.parse(raw) : []
            set({ todos, isLoaded: true })
        } catch {
            set({ isLoaded: true })
        }
    },

    addTodo: async (text, priority = 'medium', dueDate = null) => {
        const todo: Todo = {
            id: genId(),
            text: text.trim(),
            completed: false,
            priority,
            createdAt: new Date().toISOString(),
            completedAt: null,
            dueDate,
            notes: null,
        }
        const next = [todo, ...get().todos]
        set({ todos: next })
        await persist(next)
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

    reorderTodos: async (from, to) => {
        const arr = [...get().todos]
        const [item] = arr.splice(from, 1)
        arr.splice(to, 0, item)
        set({ todos: arr })
        await persist(arr)
    },

    setFilter: (filter) => set({ filter }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),

    filteredTodos: () => {
        const { todos, filter, searchQuery } = get()
        let result = todos
        if (filter === 'active') result = result.filter(t => !t.completed)
        else if (filter === 'completed') result = result.filter(t => t.completed)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter(t => t.text.toLowerCase().includes(q))
        }
        // Sort: incomplete high → medium → low, then completed last
        return result.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1
            const pOrder = { high: 0, medium: 1, low: 2 }
            return pOrder[a.priority] - pOrder[b.priority]
        })
    },

    stats: () => {
        const todos = get().todos
        return {
            total: todos.length,
            completed: todos.filter(t => t.completed).length,
            active: todos.filter(t => !t.completed).length,
            high: todos.filter(t => t.priority === 'high' && !t.completed).length,
        }
    },
}))