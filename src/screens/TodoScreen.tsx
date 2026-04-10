// src/screens/TodoScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
    View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
    Animated, Pressable, Alert, RefreshControl, Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTodoStore, Priority, FilterMode, Todo } from '../store/todoStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns'

// ── Priority config ──────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { color: string; bg: string; label: string; icon: string }> = {
    high: { color: '#EF4444', bg: '#FEF2F2', label: 'High', icon: 'alert-circle' },
    medium: { color: '#F59E0B', bg: '#FFFBEB', label: 'Medium', icon: 'remove-circle' },
    low: { color: '#10B981', bg: '#ECFDF5', label: 'Low', icon: 'checkmark-circle' },
}

const FILTERS: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Done' },
]

function formatDue(iso: string): { text: string; overdue: boolean } {
    const d = parseISO(iso)
    const overdue = isPast(d) && !isToday(d)
    if (isToday(d)) return { text: 'Today', overdue: false }
    if (isTomorrow(d)) return { text: 'Tomorrow', overdue: false }
    return { text: format(d, 'MMM d'), overdue }
}

// ── Animated todo item ───────────────────────────────────────
function TodoItem({
    item,
    onToggle,
    onDelete,
    onPress,
    theme,
}: {
    item: Todo
    onToggle: () => void
    onDelete: () => void
    onPress: () => void
    theme: ReturnType<typeof getTheme>
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current
    const pc = PRIORITY_CONFIG[item.priority]

    const handleToggle = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true, tension: 300 }),
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 300 }),
        ]).start()
        onToggle()
    }

    const due = item.dueDate ? formatDue(item.dueDate) : null

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Pressable
                style={({ pressed }) => [
                    s.todoCard,
                    { backgroundColor: theme.surface },
                    pressed && { opacity: 0.9 },
                    item.completed && { opacity: 0.6 },
                ]}
                onPress={onPress}
                onLongPress={onDelete}
            >
                {/* Priority accent */}
                <View style={[s.priorityBar, { backgroundColor: pc.color }]} />

                {/* Checkbox */}
                <TouchableOpacity style={s.checkWrap} onPress={handleToggle} activeOpacity={0.7}>
                    <View style={[
                        s.checkbox,
                        { borderColor: item.completed ? pc.color : theme.border },
                        item.completed && { backgroundColor: pc.color },
                    ]}>
                        {item.completed && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                </TouchableOpacity>

                {/* Content */}
                <View style={s.todoContent}>
                    <Text
                        style={[
                            s.todoText,
                            { color: theme.text },
                            item.completed && { textDecorationLine: 'line-through', color: theme.textTertiary },
                        ]}
                        numberOfLines={2}
                    >
                        {item.text}
                    </Text>
                    <View style={s.todoMeta}>
                        {/* Priority badge */}
                        <View style={[s.priorityBadge, { backgroundColor: pc.bg }]}>
                            <Ionicons name={pc.icon as any} size={10} color={pc.color} />
                            <Text style={[s.priorityLabel, { color: pc.color }]}>{pc.label}</Text>
                        </View>
                        {/* Due date */}
                        {due && (
                            <View style={[s.dueBadge, { backgroundColor: due.overdue ? '#FEF2F2' : theme.surfaceSecondary }]}>
                                <Ionicons
                                    name="calendar-outline"
                                    size={10}
                                    color={due.overdue ? COLORS.cashOut : theme.textTertiary}
                                />
                                <Text style={[s.dueText, { color: due.overdue ? COLORS.cashOut : theme.textTertiary }]}>
                                    {' '}{due.text}
                                </Text>
                            </View>
                        )}
                        {/* Notes indicator */}
                        {item.notes && (
                            <Ionicons name="document-text-outline" size={12} color={theme.textTertiary} />
                        )}
                    </View>
                </View>

                {/* Swipe arrow */}
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Pressable>
        </Animated.View>
    )
}

// ── Add Todo Bottom Sheet ────────────────────────────────────
function AddTodoSheet({
    visible,
    onClose,
    theme,
}: {
    visible: boolean
    onClose: () => void
    theme: ReturnType<typeof getTheme>
}) {
    const [text, setText] = useState('')
    const [priority, setPriority] = useState<Priority>('medium')
    const addTodo = useTodoStore(s => s.addTodo)
    const inputRef = useRef<TextInput>(null)

    useEffect(() => {
        if (visible) {
            setTimeout(() => inputRef.current?.focus(), 100)
        } else {
            setText('')
            setPriority('medium')
        }
    }, [visible])

    const handleAdd = async () => {
        if (!text.trim()) return
        await addTodo(text, priority)
        setText('')
        Keyboard.dismiss()
        onClose()
    }

    if (!visible) return null

    return (
        <View style={[s.addSheet, { backgroundColor: theme.surface }]}>
            <View style={[s.addSheetHandle, { backgroundColor: theme.border }]} />

            <Text style={[s.addSheetTitle, { color: theme.text }]}>New Task</Text>

            {/* Text input */}
            <TextInput
                ref={inputRef}
                style={[s.addInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={text}
                onChangeText={setText}
                placeholder="What needs to be done?"
                placeholderTextColor={theme.textTertiary}
                multiline
                maxLength={200}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
            />

            {/* Priority selector */}
            <Text style={[s.addLabel, { color: theme.textSecondary }]}>Priority</Text>
            <View style={s.priorityRow}>
                {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG.high][]).map(([key, cfg]) => (
                    <TouchableOpacity
                        key={key}
                        style={[
                            s.priorityChip,
                            { borderColor: theme.border, backgroundColor: theme.background },
                            priority === key && { borderColor: cfg.color, backgroundColor: cfg.bg },
                        ]}
                        onPress={() => setPriority(key)}
                        activeOpacity={0.8}
                    >
                        <Ionicons name={cfg.icon as any} size={14} color={priority === key ? cfg.color : theme.textTertiary} />
                        <Text style={[s.priorityChipText, { color: priority === key ? cfg.color : theme.textSecondary }]}>
                            {cfg.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Actions */}
            <View style={s.addActions}>
                <TouchableOpacity style={[s.addCancelBtn, { borderColor: theme.border }]} onPress={onClose}>
                    <Text style={[s.addCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.addConfirmBtn, !text.trim() && { opacity: 0.5 }]}
                    onPress={handleAdd}
                    disabled={!text.trim()}
                    activeOpacity={0.88}
                >
                    <LinearGradient colors={['#5B5FED', '#7C3AED']} style={s.addConfirmGrad}>
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={s.addConfirmText}>Add Task</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    )
}

// ── Edit Todo Modal ──────────────────────────────────────────
function EditTodoModal({
    todo,
    onClose,
    theme,
}: {
    todo: Todo | null
    onClose: () => void
    theme: ReturnType<typeof getTheme>
}) {
    const [text, setText] = useState(todo?.text || '')
    const [priority, setPriority] = useState<Priority>(todo?.priority || 'medium')
    const [notes, setNotes] = useState(todo?.notes || '')
    const updateTodo = useTodoStore(s => s.updateTodo)
    const deleteTodo = useTodoStore(s => s.deleteTodo)

    useEffect(() => {
        if (todo) { setText(todo.text); setPriority(todo.priority); setNotes(todo.notes || '') }
    }, [todo])

    if (!todo) return null

    const handleSave = async () => {
        if (!text.trim()) return
        await updateTodo(todo.id, { text: text.trim(), priority, notes: notes.trim() || null })
        onClose()
    }

    const handleDelete = () => {
        Alert.alert('Delete Task', `Delete "${todo.text}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTodo(todo.id); onClose() } },
        ])
    }

    return (
        <View style={s.editOverlay} pointerEvents="box-none">
            <Pressable style={s.editBackdrop} onPress={onClose} />
            <View style={[s.editSheet, { backgroundColor: theme.surface }]}>
                <View style={[s.addSheetHandle, { backgroundColor: theme.border }]} />

                <View style={s.editHeader}>
                    <Text style={[s.addSheetTitle, { color: theme.text }]}>Edit Task</Text>
                    <TouchableOpacity onPress={handleDelete}>
                        <Ionicons name="trash-outline" size={20} color={COLORS.cashOut} />
                    </TouchableOpacity>
                </View>

                <TextInput
                    style={[s.addInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={text}
                    onChangeText={setText}
                    multiline maxLength={200}
                    autoFocus
                />

                <Text style={[s.addLabel, { color: theme.textSecondary }]}>Priority</Text>
                <View style={s.priorityRow}>
                    {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG.high][]).map(([key, cfg]) => (
                        <TouchableOpacity
                            key={key}
                            style={[
                                s.priorityChip,
                                { borderColor: theme.border, backgroundColor: theme.background },
                                priority === key && { borderColor: cfg.color, backgroundColor: cfg.bg },
                            ]}
                            onPress={() => setPriority(key)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name={cfg.icon as any} size={14} color={priority === key ? cfg.color : theme.textTertiary} />
                            <Text style={[s.priorityChipText, { color: priority === key ? cfg.color : theme.textSecondary }]}>
                                {cfg.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={[s.addLabel, { color: theme.textSecondary }]}>Notes (optional)</Text>
                <TextInput
                    style={[s.notesInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Add a note..."
                    placeholderTextColor={theme.textTertiary}
                    multiline maxLength={500}
                />

                <View style={s.addActions}>
                    <TouchableOpacity style={[s.addCancelBtn, { borderColor: theme.border }]} onPress={onClose}>
                        <Text style={[s.addCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.addConfirmBtn, !text.trim() && { opacity: 0.5 }]}
                        onPress={handleSave}
                        disabled={!text.trim()}
                        activeOpacity={0.88}
                    >
                        <LinearGradient colors={['#5B5FED', '#7C3AED']} style={s.addConfirmGrad}>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={s.addConfirmText}>Save</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    )
}

// ── Main Screen ──────────────────────────────────────────────
export default function TodoScreen() {
    const {
        load, isLoaded, filter, searchQuery,
        setFilter, setSearchQuery, clearCompleted,
        filteredTodos, stats,
    } = useTodoStore()
    const { mode } = useThemeStore()
    const theme = getTheme(mode)

    const [addVisible, setAddVisible] = useState(false)
    const [editTodo, setEditTodo] = useState<Todo | null>(null)
    const [searchVisible, setSearchVisible] = useState(false)

    useEffect(() => { if (!isLoaded) load() }, [])

    const todos = filteredTodos()
    const stat = stats()
    const completionPct = stat.total > 0 ? (stat.completed / stat.total) * 100 : 0

    const handleClearCompleted = () => {
        if (stat.completed === 0) return
        Alert.alert('Clear Completed', `Remove all ${stat.completed} completed tasks?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: clearCompleted },
        ])
    }

    return (
        <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={[s.headerTitle, { color: theme.text }]}>Tasks</Text>
                    <Text style={[s.headerSub, { color: theme.textSecondary }]}>
                        {stat.active} remaining · {stat.completed} done
                    </Text>
                </View>
                <View style={s.headerActions}>
                    <TouchableOpacity
                        style={[s.headerBtn, { backgroundColor: theme.surface }]}
                        onPress={() => setSearchVisible(v => !v)}
                    >
                        <Ionicons name={searchVisible ? 'close' : 'search'} size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                    {stat.completed > 0 && (
                        <TouchableOpacity
                            style={[s.headerBtn, { backgroundColor: theme.surface }]}
                            onPress={handleClearCompleted}
                        >
                            <Ionicons name="checkmark-done-outline" size={18} color={COLORS.cashIn} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Progress bar */}
            {stat.total > 0 && (
                <View style={[s.progressWrap, { backgroundColor: theme.border }]}>
                    <Animated.View
                        style={[s.progressFill, { width: `${completionPct}%` as any }]}
                    />
                </View>
            )}

            {/* Search bar */}
            {searchVisible && (
                <View style={[s.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Ionicons name="search-outline" size={16} color={theme.textTertiary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={[s.searchInput, { color: theme.text }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search tasks..."
                        placeholderTextColor={theme.textTertiary}
                        autoFocus
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Filter tabs */}
            <View style={[s.filterBar, { backgroundColor: theme.background }]}>
                {FILTERS.map(f => {
                    const active = filter === f.key
                    const count = f.key === 'all' ? stat.total : f.key === 'active' ? stat.active : stat.completed
                    return (
                        <TouchableOpacity
                            key={f.key}
                            style={[
                                s.filterTab,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                            ]}
                            onPress={() => setFilter(f.key)}
                            activeOpacity={0.8}
                        >
                            <Text style={[s.filterTabText, { color: active ? '#fff' : theme.textSecondary }]}>
                                {f.label}
                            </Text>
                            {count > 0 && (
                                <View style={[s.filterCount, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.surfaceSecondary }]}>
                                    <Text style={[s.filterCountText, { color: active ? '#fff' : theme.textTertiary }]}>
                                        {count}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )
                })}
            </View>

            {/* Urgent badge */}
            {stat.high > 0 && filter !== 'completed' && (
                <View style={[s.urgentBanner, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="alert-circle" size={14} color="#EF4444" />
                    <Text style={s.urgentText}>{stat.high} high-priority task{stat.high > 1 ? 's' : ''} pending</Text>
                </View>
            )}

            {/* Todo list */}
            <FlatList
                data={todos}
                keyExtractor={t => t.id}
                renderItem={({ item }) => (
                    <TodoItem
                        item={item}
                        onToggle={() => useTodoStore.getState().toggleTodo(item.id)}
                        onDelete={() => Alert.alert('Delete', `Delete "${item.text}"?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => useTodoStore.getState().deleteTodo(item.id) },
                        ])}
                        onPress={() => setEditTodo(item)}
                        theme={theme}
                    />
                )}
                contentContainerStyle={[s.list, todos.length === 0 && s.listEmpty]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={s.empty}>
                        <LinearGradient colors={[COLORS.primaryLight, theme.background]} style={s.emptyIcon}>
                            <Ionicons name="checkmark-done-circle-outline" size={44} color={COLORS.primary} />
                        </LinearGradient>
                        <Text style={[s.emptyTitle, { color: theme.text }]}>
                            {filter === 'completed' ? 'No completed tasks yet' : 'All clear!'}
                        </Text>
                        <Text style={[s.emptySub, { color: theme.textSecondary }]}>
                            {filter === 'completed'
                                ? 'Complete a task to see it here.'
                                : filter === 'active'
                                    ? 'No active tasks. Add one below.'
                                    : 'Tap + to add your first task.'
                            }
                        </Text>
                    </View>
                }
            />

            {/* FAB */}
            <TouchableOpacity
                style={s.fab}
                onPress={() => setAddVisible(true)}
                activeOpacity={0.9}
            >
                <LinearGradient colors={['#5B5FED', '#7C3AED']} style={s.fabGrad}>
                    <Ionicons name="add" size={28} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>

            {/* Add sheet */}
            {addVisible && (
                <View style={s.sheetOverlay}>
                    <Pressable style={s.sheetBackdrop} onPress={() => { setAddVisible(false); Keyboard.dismiss() }} />
                    <AddTodoSheet visible={addVisible} onClose={() => setAddVisible(false)} theme={theme} />
                </View>
            )}

            {/* Edit modal */}
            {editTodo && (
                <EditTodoModal todo={editTodo} onClose={() => setEditTodo(null)} theme={theme} />
            )}
        </SafeAreaView>
    )
}

const s = StyleSheet.create({
    container: { flex: 1 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
    headerTitle: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', letterSpacing: -0.5 },
    headerSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: SPACING.sm },
    headerBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm },

    progressWrap: { height: 3, marginHorizontal: SPACING.lg, borderRadius: 2, marginBottom: SPACING.sm, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },

    searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, paddingHorizontal: SPACING.md, height: 44 },
    searchInput: { flex: 1, fontSize: FONT_SIZE.md },

    filterBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.sm },
    filterTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5 },
    filterTabText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
    filterCount: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    filterCountText: { fontSize: 10, fontWeight: '700' },

    urgentBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.sm, borderRadius: BORDER_RADIUS.md },
    urgentText: { fontSize: FONT_SIZE.xs, color: '#EF4444', fontWeight: '600' },

    list: { paddingHorizontal: SPACING.lg, paddingBottom: 110 },
    listEmpty: { flex: 1 },

    todoCard: { flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.lg, marginBottom: 8, overflow: 'hidden', ...SHADOW.sm },
    priorityBar: { width: 4, alignSelf: 'stretch' },
    checkWrap: { padding: SPACING.md },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    todoContent: { flex: 1, paddingVertical: SPACING.md, paddingRight: SPACING.sm },
    todoText: { fontSize: FONT_SIZE.md, fontWeight: '500', marginBottom: 4, lineHeight: 20 },
    todoMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    priorityLabel: { fontSize: 10, fontWeight: '700' },
    dueBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    dueText: { fontSize: 10, fontWeight: '600' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: SPACING.sm },
    emptyIcon: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
    emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800' },
    emptySub: { fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22 },

    fab: { position: 'absolute', bottom: SPACING.xl, right: SPACING.lg, borderRadius: 30, overflow: 'hidden', ...SHADOW.lg },
    fabGrad: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },

    // Add / Edit sheets
    sheetOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    addSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SPACING.lg, paddingBottom: 40, ...SHADOW.lg },
    addSheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: SPACING.md },
    addSheetTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: SPACING.md },
    addInput: { borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, padding: SPACING.md, fontSize: FONT_SIZE.md, minHeight: 80, textAlignVertical: 'top', marginBottom: SPACING.lg },
    addLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm },
    priorityRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
    priorityChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5 },
    priorityChipText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
    addActions: { flexDirection: 'row', gap: SPACING.sm },
    addCancelBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1.5 },
    addCancelText: { fontSize: FONT_SIZE.md, fontWeight: '600' },
    addConfirmBtn: { flex: 2, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
    addConfirmGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, gap: 6 },
    addConfirmText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },

    // Edit overlay
    editOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 200 },
    editBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    editSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SPACING.lg, paddingBottom: 40, ...SHADOW.lg },
    editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
    notesInput: { borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, padding: SPACING.md, fontSize: FONT_SIZE.md, minHeight: 60, textAlignVertical: 'top', marginBottom: SPACING.lg },
})