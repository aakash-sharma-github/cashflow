// src/screens/TodoScreen.tsx
// Features:
//   1. Task reminders with push notifications (5-min warning + pending alert)
//   2. Three-dot menu per task (Edit, Delete); tap task = preview modal
//   3. Bottom-sheet add/edit with slide-from-bottom animation
//   4. Entry notifications via realtime in notificationService

import React, { useEffect, useState, useCallback, useRef, memo } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Animated,
    Pressable,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
    themedAlert,
    themedActionSheet,
} from "../components/common/ThemedAlert";
import { useTodoStore, Priority, FilterMode, Todo } from "../store/todoStore";
import { useThemeStore, getTheme } from "../store/themeStore";
import { notificationService } from "../services/notificationService";
import {
    COLORS,
    SPACING,
    BORDER_RADIUS,
    FONT_SIZE,
    SHADOW,
} from "../constants";
import {
    format,
    isToday,
    isTomorrow,
    isPast,
    parseISO,
    addMinutes,
} from "date-fns";

// ── Priority config ───────────────────────────────────────────
const PC: Record<
    Priority,
    { color: string; bg: string; label: string; icon: string }
> = {
    high: {
        color: COLORS.danger,
        bg: COLORS.cashOutLight,
        label: "High",
        icon: "alert-circle",
    },
    medium: {
        color: COLORS.warning,
        bg: "#FFFBEB",
        label: "Medium",
        icon: "remove-circle",
    },
    low: {
        color: COLORS.success,
        bg: COLORS.cashInLight,
        label: "Low",
        icon: "checkmark-circle",
    },
};

const FILTERS: { key: FilterMode; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Done" },
];

function formatDue(iso: string): { text: string; overdue: boolean } {
    const d = parseISO(iso);
    const overdue = isPast(d) && !isToday(d);
    if (isToday(d)) return { text: "Today", overdue: false };
    if (isTomorrow(d)) return { text: "Tomorrow", overdue: false };
    return { text: format(d, "MMM d"), overdue };
}

// ── Animated slide-up sheet ───────────────────────────────────
// Used for both Add and Edit sheets
function useSlideAnim(visible: boolean) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.spring(anim, {
            toValue: visible ? 1 : 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
        }).start();
    }, [visible]);
    return anim;
}

// ── Task reminder helper ──────────────────────────────────────
async function scheduleReminder(todo: Todo, reminderDate: Date) {
    const noteId = await notificationService.scheduleTaskReminder(
        todo.id,
        todo.text,
        reminderDate,
    );
    const dueId = await notificationService.scheduleTaskPending(
        todo.id,
        todo.text,
        reminderDate,
    );
    await useTodoStore.getState().updateTodo(todo.id, {
        reminderDate: reminderDate.toISOString(),
        reminderNoteId: noteId,
        reminderDueId: dueId,
    });
}

async function cancelReminder(todo: Todo) {
    await notificationService.cancelTaskReminder(todo.id);
    await useTodoStore.getState().updateTodo(todo.id, {
        reminderDate: null,
        reminderNoteId: null,
        reminderDueId: null,
    });
}

// ── Date/Time picker row ──────────────────────────────────────
function DateTimeRow({
    label,
    value,
    onChange,
    theme,
    iconName,
}: {
    label: string;
    value: Date | null;
    onChange: (d: Date | null) => void;
    theme: ReturnType<typeof getTheme>;
    iconName: string;
}) {
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
    const [tempDate, setTempDate] = useState(value ?? new Date());
    const isAndroid = Platform.OS === "android";

    const openDate = () => {
        setTempDate(value ?? new Date());
        setPickerMode("date");
        setShowPicker(true);
    };

    const handleChange = (_: any, selected?: Date) => {
        if (!selected) {
            setShowPicker(false);
            return;
        }
        if (isAndroid) {
            if (pickerMode === "date") {
                setTempDate(selected);
                setPickerMode("time");
            } else {
                setShowPicker(false);
                onChange(selected);
            }
        } else {
            setTempDate(selected);
        }
    };

    return (
        <View style={{ marginBottom: SPACING.md }}>
            <Text style={[sheetS.label, { color: theme.textSecondary }]}>
                {label}
            </Text>
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                <TouchableOpacity
                    style={[
                        sheetS.dateBtn,
                        {
                            backgroundColor: theme.surfaceSecondary,
                            borderColor: value ? COLORS.primary : theme.border,
                        },
                    ]}
                    onPress={openDate}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name={iconName as any}
                        size={16}
                        color={value ? COLORS.primary : theme.textTertiary}
                    />
                    <Text
                        style={[
                            sheetS.dateBtnText,
                            { color: value ? COLORS.primary : theme.textTertiary },
                        ]}
                    >
                        {value ? format(value, "dd MMM yyyy, h:mm a") : "Set date & time"}
                    </Text>
                </TouchableOpacity>
                {value && (
                    <TouchableOpacity
                        style={[sheetS.clearBtn, { backgroundColor: COLORS.cashOutLight }]}
                        onPress={() => onChange(null)}
                    >
                        <Ionicons name="close" size={14} color={COLORS.cashOut} />
                    </TouchableOpacity>
                )}
            </View>
            {showPicker && (
                <DateTimePicker
                    value={tempDate}
                    mode={pickerMode}
                    display={isAndroid ? "default" : "spinner"}
                    onChange={handleChange}
                    minimumDate={new Date()}
                    textColor={theme.text}
                />
            )}
            {!isAndroid && showPicker && (
                <View
                    style={{
                        flexDirection: "row",
                        justifyContent: "flex-end",
                        gap: SPACING.sm,
                        marginTop: SPACING.sm,
                    }}
                >
                    <TouchableOpacity onPress={() => setShowPicker(false)}>
                        <Text
                            style={{ color: theme.textSecondary, fontSize: FONT_SIZE.sm }}
                        >
                            Cancel
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            setShowPicker(false);
                            onChange(tempDate);
                        }}
                    >
                        <Text
                            style={{
                                color: COLORS.primary,
                                fontWeight: "700",
                                fontSize: FONT_SIZE.sm,
                            }}
                        >
                            Done
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

// ── Add Sheet — slides up from bottom ─────────────────────────
function AddSheet({
    visible,
    onClose,
    theme,
}: {
    visible: boolean;
    onClose: () => void;
    theme: ReturnType<typeof getTheme>;
}) {
    const slideAnim = useSlideAnim(visible);
    const translateY = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [600, 0],
    });
    const opacity = slideAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 1, 1],
    });

    const [text, setText] = useState("");
    const [priority, setPriority] = useState<Priority>("medium");
    const [notes, setNotes] = useState("");
    const [dueDate, setDueDate] = useState<Date | null>(null);
    const [reminderDate, setReminderDate] = useState<Date | null>(null);
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            setTimeout(() => inputRef.current?.focus(), 350);
        } else {
            setText("");
            setPriority("medium");
            setNotes("");
            setDueDate(null);
            setReminderDate(null);
        }
    }, [visible]);

    const handleAdd = async () => {
        if (!text.trim()) return;
        const todo = await useTodoStore
            .getState()
            .addTodo(
                text.trim(),
                priority,
                dueDate?.toISOString() ?? null,
                reminderDate?.toISOString() ?? null,
            );
        if (reminderDate) await scheduleReminder(todo, reminderDate);
        Keyboard.dismiss();
        onClose();
    };

    if (!visible) return null;

    return (
        <Animated.View
            style={[sheetS.overlay, { opacity }]}
            pointerEvents="box-none"
        >
            <Pressable
                style={sheetS.backdrop}
                onPress={() => {
                    Keyboard.dismiss();
                    onClose();
                }}
            />
            <Animated.View
                style={[
                    sheetS.sheet,
                    { backgroundColor: theme.surface, transform: [{ translateY }] },
                ]}
            >
                <View style={[sheetS.handle, { backgroundColor: theme.border }]} />
                <Text style={[sheetS.title, { color: theme.text }]}>New Task</Text>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <TextInput
                        ref={inputRef}
                        style={[
                            sheetS.input,
                            {
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                                color: theme.text,
                            },
                        ]}
                        value={text}
                        onChangeText={setText}
                        placeholder="What needs to be done?"
                        placeholderTextColor={theme.textTertiary}
                        multiline
                        maxLength={200}
                    />
                    <Text style={[sheetS.label, { color: theme.textSecondary }]}>
                        Priority
                    </Text>
                    <View style={sheetS.priorityRow}>
                        {(Object.entries(PC) as [Priority, typeof PC.high][]).map(
                            ([k, c]) => (
                                <TouchableOpacity
                                    key={k}
                                    style={[
                                        sheetS.priorityChip,
                                        {
                                            borderColor: theme.border,
                                            backgroundColor: theme.background,
                                        },
                                        priority === k && {
                                            borderColor: c.color,
                                            backgroundColor: c.bg,
                                        },
                                    ]}
                                    onPress={() => setPriority(k)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons
                                        name={c.icon as any}
                                        size={14}
                                        color={priority === k ? c.color : theme.textTertiary}
                                    />
                                    <Text
                                        style={[
                                            sheetS.priorityText,
                                            { color: priority === k ? c.color : theme.textSecondary },
                                        ]}
                                    >
                                        {c.label}
                                    </Text>
                                </TouchableOpacity>
                            ),
                        )}
                    </View>
                    <DateTimeRow
                        label="Due Date"
                        value={dueDate}
                        onChange={setDueDate}
                        theme={theme}
                        iconName="calendar-outline"
                    />
                    <DateTimeRow
                        label="🔔 Reminder"
                        value={reminderDate}
                        onChange={setReminderDate}
                        theme={theme}
                        iconName="alarm-outline"
                    />
                    {reminderDate && (
                        <View
                            style={[
                                sheetS.reminderHint,
                                { backgroundColor: COLORS.primaryLight },
                            ]}
                        >
                            <Ionicons
                                name="information-circle-outline"
                                size={13}
                                color={COLORS.primary}
                            />
                            <Text
                                style={[sheetS.reminderHintText, { color: COLORS.primary }]}
                            >
                                You'll get a reminder 5 min before, and again if incomplete
                            </Text>
                        </View>
                    )}
                    <Text style={[sheetS.label, { color: theme.textSecondary }]}>
                        Notes (optional)
                    </Text>
                    <TextInput
                        style={[
                            sheetS.notesInput,
                            {
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                                color: theme.text,
                            },
                        ]}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Add details..."
                        placeholderTextColor={theme.textTertiary}
                        multiline
                        maxLength={500}
                    />
                </ScrollView>
                <View style={sheetS.actions}>
                    <TouchableOpacity
                        style={[sheetS.cancelBtn, { borderColor: theme.border }]}
                        onPress={onClose}
                    >
                        <Text style={[sheetS.cancelText, { color: theme.textSecondary }]}>
                            Cancel
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[sheetS.confirmBtn, !text.trim() && { opacity: 0.5 }]}
                        onPress={handleAdd}
                        disabled={!text.trim()}
                        activeOpacity={0.88}
                    >
                        <LinearGradient
                            colors={["#5B5FED", "#7C3AED"]}
                            style={sheetS.confirmGrad}
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={sheetS.confirmText}>Add Task</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Animated.View>
    );
}

// ── Edit Sheet — same slide-up animation ──────────────────────
function EditSheet({
    todo,
    onClose,
    theme,
}: {
    todo: Todo | null;
    onClose: () => void;
    theme: ReturnType<typeof getTheme>;
}) {
    const visible = !!todo;
    const slideAnim = useSlideAnim(visible);
    const translateY = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [600, 0],
    });
    const opacity = slideAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 1, 1],
    });

    const [text, setText] = useState("");
    const [priority, setPriority] = useState<Priority>("medium");
    const [notes, setNotes] = useState("");
    const [dueDate, setDueDate] = useState<Date | null>(null);
    const [reminderDate, setReminderDate] = useState<Date | null>(null);

    useEffect(() => {
        if (todo) {
            setText(todo.text);
            setPriority(todo.priority);
            setNotes(todo.notes ?? "");
            setDueDate(todo.dueDate ? parseISO(todo.dueDate) : null);
            setReminderDate(todo.reminderDate ? parseISO(todo.reminderDate) : null);
        }
    }, [todo]);

    if (!todo) return null;

    const handleSave = async () => {
        if (!text.trim()) return;
        // Cancel old reminders before saving
        if (todo.reminderDate)
            await notificationService.cancelTaskReminder(todo.id);
        await useTodoStore.getState().updateTodo(todo.id, {
            text: text.trim(),
            priority,
            notes: notes.trim() || null,
            dueDate: dueDate?.toISOString() ?? null,
            reminderDate: reminderDate?.toISOString() ?? null,
            reminderNoteId: null,
            reminderDueId: null,
        });
        // Re-schedule new reminder if set
        if (reminderDate) {
            const updated = useTodoStore
                .getState()
                .todos.find((t) => t.id === todo.id);
            if (updated) await scheduleReminder(updated, reminderDate);
        }
        onClose();
    };

    const handleDelete = () => {
        themedAlert("Delete Task", `"${todo.text}" will be permanently removed.`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    await notificationService.cancelTaskReminder(todo.id);
                    await useTodoStore.getState().deleteTodo(todo.id);
                    onClose();
                },
            },
        ]);
    };

    return (
        <Animated.View
            style={[sheetS.overlay, { opacity }]}
            pointerEvents="box-none"
        >
            <Pressable
                style={sheetS.backdrop}
                onPress={() => {
                    Keyboard.dismiss();
                    onClose();
                }}
            />
            <Animated.View
                style={[
                    sheetS.sheet,
                    { backgroundColor: theme.surface, transform: [{ translateY }] },
                ]}
            >
                <View style={[sheetS.handle, { backgroundColor: theme.border }]} />
                <View style={sheetS.editHeader}>
                    <Text style={[sheetS.title, { color: theme.text }]}>Edit Task</Text>
                    <TouchableOpacity onPress={handleDelete} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={20} color={COLORS.cashOut} />
                    </TouchableOpacity>
                </View>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <TextInput
                        style={[
                            sheetS.input,
                            {
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                                color: theme.text,
                            },
                        ]}
                        value={text}
                        onChangeText={setText}
                        multiline
                        maxLength={200}
                        autoFocus
                    />
                    <Text style={[sheetS.label, { color: theme.textSecondary }]}>
                        Priority
                    </Text>
                    <View style={sheetS.priorityRow}>
                        {(Object.entries(PC) as [Priority, typeof PC.high][]).map(
                            ([k, c]) => (
                                <TouchableOpacity
                                    key={k}
                                    style={[
                                        sheetS.priorityChip,
                                        {
                                            borderColor: theme.border,
                                            backgroundColor: theme.background,
                                        },
                                        priority === k && {
                                            borderColor: c.color,
                                            backgroundColor: c.bg,
                                        },
                                    ]}
                                    onPress={() => setPriority(k)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons
                                        name={c.icon as any}
                                        size={14}
                                        color={priority === k ? c.color : theme.textTertiary}
                                    />
                                    <Text
                                        style={[
                                            sheetS.priorityText,
                                            { color: priority === k ? c.color : theme.textSecondary },
                                        ]}
                                    >
                                        {c.label}
                                    </Text>
                                </TouchableOpacity>
                            ),
                        )}
                    </View>
                    <DateTimeRow
                        label="Due Date"
                        value={dueDate}
                        onChange={setDueDate}
                        theme={theme}
                        iconName="calendar-outline"
                    />
                    <DateTimeRow
                        label="🔔 Reminder"
                        value={reminderDate}
                        onChange={setReminderDate}
                        theme={theme}
                        iconName="alarm-outline"
                    />
                    {reminderDate && (
                        <View
                            style={[
                                sheetS.reminderHint,
                                { backgroundColor: COLORS.primaryLight },
                            ]}
                        >
                            <Ionicons
                                name="information-circle-outline"
                                size={13}
                                color={COLORS.primary}
                            />
                            <Text
                                style={[sheetS.reminderHintText, { color: COLORS.primary }]}
                            >
                                Reminder 5 min before + pending alert if incomplete
                            </Text>
                        </View>
                    )}
                    <Text style={[sheetS.label, { color: theme.textSecondary }]}>
                        Notes (optional)
                    </Text>
                    <TextInput
                        style={[
                            sheetS.notesInput,
                            {
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                                color: theme.text,
                            },
                        ]}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Add details..."
                        placeholderTextColor={theme.textTertiary}
                        multiline
                        maxLength={500}
                    />
                </ScrollView>
                <View style={sheetS.actions}>
                    <TouchableOpacity
                        style={[sheetS.cancelBtn, { borderColor: theme.border }]}
                        onPress={onClose}
                    >
                        <Text style={[sheetS.cancelText, { color: theme.textSecondary }]}>
                            Cancel
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[sheetS.confirmBtn, !text.trim() && { opacity: 0.5 }]}
                        onPress={handleSave}
                        disabled={!text.trim()}
                        activeOpacity={0.88}
                    >
                        <LinearGradient
                            colors={["#5B5FED", "#7C3AED"]}
                            style={sheetS.confirmGrad}
                        >
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={sheetS.confirmText}>Save</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Animated.View>
    );
}

// ── Task Preview Modal ─────────────────────────────────────────
function TaskPreview({
    todo,
    onClose,
    onEdit,
    theme,
}: {
    todo: Todo | null;
    onClose: () => void;
    onEdit: () => void;
    theme: ReturnType<typeof getTheme>;
}) {
    if (!todo) return null;
    const pc = PC[todo.priority];
    const due = todo.dueDate ? formatDue(todo.dueDate) : null;
    const rem = todo.reminderDate ? parseISO(todo.reminderDate) : null;

    return (
        <Modal
            transparent
            visible={!!todo}
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={previewS.backdrop} onPress={onClose} />
            <View style={[previewS.card, { backgroundColor: theme.surface }]}>
                {/* Priority accent */}
                <View style={[previewS.accentBar, { backgroundColor: pc.color }]} />
                <View style={previewS.body}>
                    {/* Header */}
                    <View style={previewS.header}>
                        <View style={[previewS.priorityPill, { backgroundColor: pc.bg }]}>
                            <Ionicons name={pc.icon as any} size={12} color={pc.color} />
                            <Text style={[previewS.priorityText, { color: pc.color }]}>
                                {pc.label} Priority
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                            <Ionicons name="close" size={20} color={theme.textTertiary} />
                        </TouchableOpacity>
                    </View>

                    {/* Task text */}
                    <Text
                        style={[
                            previewS.taskText,
                            { color: theme.text },
                            todo.completed && {
                                textDecorationLine: "line-through",
                                color: theme.textTertiary,
                            },
                        ]}
                    >
                        {todo.text}
                    </Text>

                    {/* Status badge */}
                    <View
                        style={[
                            previewS.statusBadge,
                            {
                                backgroundColor: todo.completed
                                    ? COLORS.cashInLight
                                    : theme.surfaceSecondary,
                            },
                        ]}
                    >
                        <Ionicons
                            name={todo.completed ? "checkmark-circle" : "time-outline"}
                            size={13}
                            color={todo.completed ? COLORS.cashIn : theme.textSecondary}
                        />
                        <Text
                            style={[
                                previewS.statusText,
                                { color: todo.completed ? COLORS.cashIn : theme.textSecondary },
                            ]}
                        >
                            {todo.completed
                                ? `Completed ${todo.completedAt ? format(parseISO(todo.completedAt), "dd MMM, h:mm a") : ""}`
                                : "Active"}
                        </Text>
                    </View>

                    {/* Meta rows */}
                    {due && (
                        <View style={previewS.metaRow}>
                            <Ionicons
                                name="calendar-outline"
                                size={14}
                                color={due.overdue ? COLORS.cashOut : theme.textTertiary}
                            />
                            <Text
                                style={[previewS.metaLabel, { color: theme.textSecondary }]}
                            >
                                Due
                            </Text>
                            <Text
                                style={[
                                    previewS.metaVal,
                                    { color: due.overdue ? COLORS.cashOut : theme.text },
                                ]}
                            >
                                {format(parseISO(todo.dueDate!), "dd MMM yyyy")}
                                {due.overdue ? " — Overdue" : ""}
                            </Text>
                        </View>
                    )}
                    {rem && (
                        <View style={previewS.metaRow}>
                            <Ionicons name="alarm-outline" size={14} color={COLORS.primary} />
                            <Text
                                style={[previewS.metaLabel, { color: theme.textSecondary }]}
                            >
                                Reminder
                            </Text>
                            <Text style={[previewS.metaVal, { color: theme.text }]}>
                                {format(rem, "dd MMM yyyy, h:mm a")}
                            </Text>
                        </View>
                    )}
                    {todo.notes && (
                        <View
                            style={[previewS.notesBox, { backgroundColor: theme.background }]}
                        >
                            <Text
                                style={[previewS.notesLabel, { color: theme.textTertiary }]}
                            >
                                Notes
                            </Text>
                            <Text style={[previewS.notesText, { color: theme.text }]}>
                                {todo.notes}
                            </Text>
                        </View>
                    )}
                    <Text style={[previewS.createdAt, { color: theme.textTertiary }]}>
                        Created {format(parseISO(todo.createdAt), "dd MMM yyyy, h:mm a")}
                    </Text>

                    {/* Actions */}
                    <View style={previewS.actions}>
                        <TouchableOpacity
                            style={[
                                previewS.toggleBtn,
                                {
                                    backgroundColor: todo.completed
                                        ? theme.surfaceSecondary
                                        : COLORS.cashInLight,
                                },
                            ]}
                            onPress={() => {
                                useTodoStore.getState().toggleTodo(todo.id);
                                onClose();
                            }}
                        >
                            <Ionicons
                                name={
                                    todo.completed
                                        ? "refresh-outline"
                                        : "checkmark-circle-outline"
                                }
                                size={16}
                                color={todo.completed ? theme.textSecondary : COLORS.cashIn}
                            />
                            <Text
                                style={[
                                    previewS.toggleText,
                                    {
                                        color: todo.completed ? theme.textSecondary : COLORS.cashIn,
                                    },
                                ]}
                            >
                                {todo.completed ? "Mark Active" : "Mark Done"}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                previewS.editBtn,
                                { backgroundColor: COLORS.primaryLight },
                            ]}
                            onPress={onEdit}
                        >
                            <Ionicons
                                name="pencil-outline"
                                size={16}
                                color={COLORS.primary}
                            />
                            <Text style={[previewS.editText, { color: COLORS.primary }]}>
                                Edit
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ── Todo item row ─────────────────────────────────────────────
const TodoItem = memo(function TodoItem({
    item,
    onToggle,
    onThreeDot,
    onPress,
    theme,
}: {
    item: Todo;
    onToggle: () => void;
    onThreeDot: () => void;
    onPress: () => void;
    theme: ReturnType<typeof getTheme>;
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const pc = PC[item.priority];
    const due = item.dueDate ? formatDue(item.dueDate) : null;
    const hasReminder = !!item.reminderDate;

    const handleToggle = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 0.94,
                useNativeDriver: true,
                tension: 300,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 300,
            }),
        ]).start();
        onToggle();
    };

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
                android_ripple={{ color: "rgba(91,95,237,0.10)" }}
            >
                <View style={[s.priorityBar, { backgroundColor: pc.color }]} />
                <TouchableOpacity
                    style={s.checkWrap}
                    onPress={handleToggle}
                    activeOpacity={0.7}
                >
                    <View
                        style={[
                            s.checkbox,
                            { borderColor: item.completed ? pc.color : theme.border },
                            item.completed && { backgroundColor: pc.color },
                        ]}
                    >
                        {item.completed && (
                            <Ionicons name="checkmark" size={12} color="#fff" />
                        )}
                    </View>
                </TouchableOpacity>
                <View style={s.todoContent}>
                    <Text
                        style={[
                            s.todoText,
                            { color: theme.text },
                            item.completed && {
                                textDecorationLine: "line-through",
                                color: theme.textTertiary,
                            },
                        ]}
                        numberOfLines={2}
                    >
                        {item.text}
                    </Text>
                    <View style={s.todoMeta}>
                        <View style={[s.priorityBadge, { backgroundColor: pc.bg }]}>
                            <Ionicons name={pc.icon as any} size={10} color={pc.color} />
                            <Text style={[s.priorityLabel, { color: pc.color }]}>
                                {pc.label}
                            </Text>
                        </View>
                        {due && (
                            <View
                                style={[
                                    s.dueBadge,
                                    {
                                        backgroundColor: due.overdue
                                            ? "#FEF2F2"
                                            : theme.surfaceSecondary,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="calendar-outline"
                                    size={10}
                                    color={due.overdue ? COLORS.cashOut : theme.textTertiary}
                                />
                                <Text
                                    style={[
                                        s.dueText,
                                        {
                                            color: due.overdue ? COLORS.cashOut : theme.textTertiary,
                                        },
                                    ]}
                                >
                                    {due.text}
                                </Text>
                            </View>
                        )}
                        {hasReminder && (
                            <View
                                style={[s.dueBadge, { backgroundColor: COLORS.primaryLight }]}
                            >
                                <Ionicons
                                    name="alarm-outline"
                                    size={10}
                                    color={COLORS.primary}
                                />
                                <Text style={[s.dueText, { color: COLORS.primary }]}>
                                    {format(parseISO(item.reminderDate!), "h:mm a")}
                                </Text>
                            </View>
                        )}
                        {item.notes && (
                            <Ionicons
                                name="document-text-outline"
                                size={12}
                                color={theme.textTertiary}
                            />
                        )}
                    </View>
                </View>
                {/* Three-dot menu */}
                <TouchableOpacity
                    onPress={onThreeDot}
                    style={s.dotBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                    <Ionicons
                        name="ellipsis-vertical"
                        size={16}
                        color={theme.textTertiary}
                    />
                </TouchableOpacity>
            </Pressable>
        </Animated.View>
    );
});

// ── Main Screen ────────────────────────────────────────────────
export default function TodoScreen() {
    const {
        load,
        isLoaded,
        filter,
        searchQuery,
        setFilter,
        setSearchQuery,
        clearCompleted,
        filteredTodos,
        stats,
    } = useTodoStore();
    const { mode } = useThemeStore();
    const theme = getTheme(mode);

    const [addVisible, setAddVisible] = useState(false);
    const [editTodo, setEditTodo] = useState<Todo | null>(null);
    const [previewTodo, setPreviewTodo] = useState<Todo | null>(null);
    const [searchVisible, setSearchVisible] = useState(false);

    useEffect(() => {
        if (!isLoaded) load();
    }, []);

    // Cancel reminders when task is toggled to complete
    const handleToggle = useCallback(async (item: Todo) => {
        await useTodoStore.getState().toggleTodo(item.id);
        // If completing a task that has a reminder, cancel the reminder
        if (!item.completed && item.reminderDate) {
            await notificationService.cancelTaskReminder(item.id);
            await useTodoStore
                .getState()
                .updateTodo(item.id, { reminderNoteId: null, reminderDueId: null });
        }
    }, []);

    const handleThreeDot = useCallback((item: Todo) => {
        themedActionSheet(item.text, undefined, [
            {
                text: "Edit",
                onPress: () => setEditTodo(item),
            },
            {
                text: "Delete",
                style: "destructive" as const,
                onPress: () =>
                    themedAlert(
                        "Delete Task",
                        `"${item.text}" will be permanently removed.`,
                        [
                            { text: "Cancel", style: "cancel" },
                            {
                                text: "Delete",
                                style: "destructive",
                                onPress: async () => {
                                    await notificationService.cancelTaskReminder(item.id);
                                    await useTodoStore.getState().deleteTodo(item.id);
                                },
                            },
                        ],
                        "trash-outline",
                    ),
            },
            { text: "Cancel", style: "cancel" as const },
        ]);
    }, []);

    const todos = filteredTodos();
    const stat = stats();
    const pct = stat.total > 0 ? (stat.completed / stat.total) * 100 : 0;

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
                        onPress={() => setSearchVisible((v) => !v)}
                    >
                        <Ionicons
                            name={searchVisible ? "close" : "search"}
                            size={18}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>
                    {stat.completed > 0 && (
                        <TouchableOpacity
                            style={[s.headerBtn, { backgroundColor: theme.surface }]}
                            onPress={() => {
                                themedAlert(
                                    "Clear Completed",
                                    `Remove all ${stat.completed} completed tasks?`,
                                    [
                                        { text: "Cancel", style: "cancel" },
                                        {
                                            text: "Clear",
                                            style: "destructive",
                                            onPress: clearCompleted,
                                        },
                                    ],
                                );
                            }}
                        >
                            <Ionicons
                                name="checkmark-done-outline"
                                size={18}
                                color={COLORS.cashIn}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Progress */}
            {stat.total > 0 && (
                <View style={[s.progressWrap, { backgroundColor: theme.border }]}>
                    <Animated.View
                        style={[s.progressFill, { width: `${pct}%` as any }]}
                    />
                </View>
            )}

            {/* Search */}
            {searchVisible && (
                <View
                    style={[
                        s.searchWrap,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                >
                    <Ionicons
                        name="search-outline"
                        size={16}
                        color={theme.textTertiary}
                        style={{ marginRight: 8 }}
                    />
                    <TextInput
                        style={[s.searchInput, { color: theme.text }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search tasks..."
                        placeholderTextColor={theme.textTertiary}
                        autoFocus
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                            <Ionicons
                                name="close-circle"
                                size={16}
                                color={theme.textTertiary}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Filters */}
            <View style={[s.filterBar, { backgroundColor: theme.background }]}>
                {FILTERS.map((f) => {
                    const active = filter === f.key;
                    const count =
                        f.key === "all"
                            ? stat.total
                            : f.key === "active"
                                ? stat.active
                                : stat.completed;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            style={[
                                s.filterTab,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                active && {
                                    backgroundColor: COLORS.primary,
                                    borderColor: COLORS.primary,
                                },
                            ]}
                            onPress={() => setFilter(f.key)}
                            activeOpacity={0.8}
                        >
                            <Text
                                style={[
                                    s.filterTabText,
                                    { color: active ? "#fff" : theme.textSecondary },
                                ]}
                            >
                                {f.label}
                            </Text>
                            {count > 0 && (
                                <View
                                    style={[
                                        s.filterCount,
                                        {
                                            backgroundColor: active
                                                ? "rgba(255,255,255,0.25)"
                                                : theme.surfaceSecondary,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            s.filterCountText,
                                            { color: active ? "#fff" : theme.textTertiary },
                                        ]}
                                    >
                                        {count}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Urgent banner */}
            {stat.high > 0 && filter !== "completed" && (
                <View
                    style={[s.urgentBanner, { backgroundColor: COLORS.cashOutLight }]}
                >
                    <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                    <Text style={[s.urgentText, { color: COLORS.danger }]}>
                        {stat.high} high-priority task{stat.high > 1 ? "s" : ""} pending
                    </Text>
                </View>
            )}

            {/* List */}
            <FlatList
                data={todos}
                keyExtractor={(t) => t.id}
                renderItem={({ item }) => (
                    <TodoItem
                        item={item}
                        onToggle={() => handleToggle(item)}
                        onThreeDot={() => handleThreeDot(item)}
                        onPress={() => setPreviewTodo(item)}
                        theme={theme}
                    />
                )}
                contentContainerStyle={[s.list, todos.length === 0 && s.listEmpty]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={s.empty}>
                        <LinearGradient
                            colors={[COLORS.primaryLight, theme.background]}
                            style={s.emptyIcon}
                        >
                            <Ionicons
                                name="checkmark-done-circle-outline"
                                size={44}
                                color={COLORS.primary}
                            />
                        </LinearGradient>
                        <Text style={[s.emptyTitle, { color: theme.text }]}>
                            {filter === "completed" ? "No completed tasks" : "All clear!"}
                        </Text>
                        <Text style={[s.emptySub, { color: theme.textSecondary }]}>
                            {filter === "completed"
                                ? "Complete a task to see it here."
                                : filter === "active"
                                    ? "No active tasks. Add one below."
                                    : "Tap + to add your first task."}
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
                <LinearGradient colors={["#5B5FED", "#7C3AED"]} style={s.fabGrad}>
                    <Ionicons name="add" size={28} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>

            {/* Sheets */}
            {addVisible && (
                <AddSheet
                    visible={addVisible}
                    onClose={() => setAddVisible(false)}
                    theme={theme}
                />
            )}
            {editTodo && (
                <EditSheet
                    todo={editTodo}
                    onClose={() => setEditTodo(null)}
                    theme={theme}
                />
            )}

            {/* Preview */}
            <TaskPreview
                todo={previewTodo}
                onClose={() => setPreviewTodo(null)}
                onEdit={() => {
                    setEditTodo(previewTodo);
                    setPreviewTodo(null);
                }}
                theme={theme}
            />
        </SafeAreaView>
    );
}

// ── Shared sheet styles ────────────────────────────────────────
const sheetS = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
        justifyContent: "flex-end",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: SPACING.lg,
        paddingBottom: 40,
        maxHeight: "90%",
        ...SHADOW.lg,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: "center",
        marginTop: 12,
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: FONT_SIZE.xl,
        fontWeight: "800",
        marginBottom: SPACING.md,
    },
    editHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: SPACING.md,
    },
    input: {
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1.5,
        padding: SPACING.md,
        fontSize: FONT_SIZE.md,
        minHeight: 80,
        textAlignVertical: "top",
        marginBottom: SPACING.lg,
    },
    notesInput: {
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1.5,
        padding: SPACING.md,
        fontSize: FONT_SIZE.md,
        minHeight: 60,
        textAlignVertical: "top",
        marginBottom: SPACING.lg,
    },
    label: {
        fontSize: FONT_SIZE.xs,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: SPACING.sm,
    },
    priorityRow: {
        flexDirection: "row",
        gap: SPACING.sm,
        marginBottom: SPACING.lg,
    },
    priorityChip: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        paddingVertical: 9,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1.5,
    },
    priorityText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
    dateBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: SPACING.md,
        paddingVertical: 11,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1.5,
    },
    dateBtnText: { fontSize: FONT_SIZE.sm, fontWeight: "500" },
    clearBtn: {
        width: 38,
        height: 38,
        borderRadius: BORDER_RADIUS.md,
        alignItems: "center",
        justifyContent: "center",
    },
    reminderHint: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        marginBottom: SPACING.md,
    },
    reminderHintText: { fontSize: FONT_SIZE.xs, flex: 1 },
    actions: { flexDirection: "row", gap: SPACING.sm, paddingTop: SPACING.sm },
    cancelBtn: {
        flex: 1,
        paddingVertical: 13,
        alignItems: "center",
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1.5,
    },
    cancelText: { fontSize: FONT_SIZE.md, fontWeight: "600" },
    confirmBtn: { flex: 2, borderRadius: BORDER_RADIUS.lg, overflow: "hidden" },
    confirmGrad: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 13,
        gap: 6,
    },
    confirmText: { fontSize: FONT_SIZE.md, fontWeight: "700", color: "#fff" },
});

// ── Preview modal styles ───────────────────────────────────────
const previewS = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.55)",
    },
    card: {
        margin: SPACING.lg,
        borderRadius: 24,
        overflow: "hidden",
        ...SHADOW.lg,
    },
    accentBar: { height: 5 },
    body: { padding: SPACING.lg },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: SPACING.md,
    },
    priorityPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    priorityText: { fontSize: FONT_SIZE.xs, fontWeight: "700" },
    taskText: {
        fontSize: FONT_SIZE.xl,
        fontWeight: "700",
        lineHeight: 26,
        marginBottom: SPACING.md,
    },
    statusBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.md,
        alignSelf: "flex-start",
        marginBottom: SPACING.md,
    },
    statusText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        marginBottom: SPACING.sm,
    },
    metaLabel: { fontSize: FONT_SIZE.sm, width: 64 },
    metaVal: { fontSize: FONT_SIZE.sm, fontWeight: "600", flex: 1 },
    notesBox: {
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginTop: SPACING.sm,
        marginBottom: SPACING.sm,
    },
    notesLabel: {
        fontSize: FONT_SIZE.xs,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    notesText: { fontSize: FONT_SIZE.sm, lineHeight: 20 },
    createdAt: {
        fontSize: FONT_SIZE.xs,
        marginTop: SPACING.sm,
        marginBottom: SPACING.lg,
    },
    actions: { flexDirection: "row", gap: SPACING.sm },
    toggleBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: BORDER_RADIUS.lg,
    },
    toggleText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
    editBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: BORDER_RADIUS.lg,
    },
    editText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
});

// ── Main screen styles ─────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        paddingBottom: SPACING.sm,
    },
    headerTitle: {
        fontSize: FONT_SIZE["2xl"],
        fontWeight: "800",
        letterSpacing: -0.5,
    },
    headerSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
    headerActions: { flexDirection: "row", gap: SPACING.sm },
    headerBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        ...SHADOW.sm,
    },

    progressWrap: {
        height: 3,
        marginHorizontal: SPACING.lg,
        borderRadius: 2,
        marginBottom: SPACING.sm,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        backgroundColor: COLORS.primary,
        borderRadius: 2,
    },

    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1.5,
        paddingHorizontal: SPACING.md,
        height: 44,
    },
    searchInput: { flex: 1, fontSize: FONT_SIZE.md },

    filterBar: {
        flexDirection: "row",
        paddingHorizontal: SPACING.lg,
        gap: SPACING.sm,
        paddingBottom: SPACING.sm,
    },
    filterTab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1.5,
    },
    filterTabText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
    filterCount: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
    },
    filterCountText: { fontSize: 10, fontWeight: "700" },

    urgentBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.sm,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
    },
    urgentText: { fontSize: FONT_SIZE.xs, fontWeight: "600" },

    list: { paddingHorizontal: SPACING.lg, paddingBottom: 110 },
    listEmpty: { flex: 1 },

    todoCard: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: BORDER_RADIUS.lg,
        marginBottom: 8,
        overflow: "hidden",
        ...SHADOW.sm,
    },
    priorityBar: { width: 4, alignSelf: "stretch" },
    checkWrap: { padding: SPACING.md },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },
    todoContent: {
        flex: 1,
        paddingVertical: SPACING.md,
        paddingRight: SPACING.sm,
    },
    todoText: {
        fontSize: FONT_SIZE.md,
        fontWeight: "500",
        marginBottom: 4,
        lineHeight: 20,
    },
    todoMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
    },
    priorityBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    priorityLabel: { fontSize: 10, fontWeight: "700" },
    dueBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    dueText: { fontSize: 10, fontWeight: "600" },
    dotBtn: { padding: SPACING.sm },

    empty: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
        gap: SPACING.sm,
    },
    emptyIcon: {
        width: 88,
        height: 88,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: SPACING.sm,
    },
    emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: "800" },
    emptySub: { fontSize: FONT_SIZE.sm, textAlign: "center", lineHeight: 22 },

    fab: {
        position: "absolute",
        bottom: SPACING.xl,
        right: SPACING.lg,
        borderRadius: 30,
        overflow: "hidden",
        ...SHADOW.lg,
    },
    fabGrad: {
        width: 58,
        height: 58,
        alignItems: "center",
        justifyContent: "center",
    },
});
