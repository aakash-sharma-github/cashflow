// src/screens/BookDetailScreen.tsx
// Performance: renderEntry wrapped in React.memo, all handlers useCallback,
// groupByDate result memoized, stable keyExtractor, getItemLayout for fixed-height rows.
import React, { useEffect, useCallback, useState, useMemo, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  SectionList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useEntriesStore } from "../store/entriesStore";
import { useBooksStore } from "../store/booksStore";
import { useAuthStore } from "../store/authStore";
import { useThemeStore, getTheme } from "../store/themeStore";
import { useEntriesRealtime } from "../hooks/useEntriesRealtime";
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  SHADOW,
} from "../constants";
import {
  themedAlert,
  themedActionSheet,
} from "../components/common/ThemedAlert";
import { formatAmount } from "../utils";
import { format, isToday, isYesterday } from "date-fns";
import { entriesService } from "../services/entriesService";
import supabase from "../services/supabase";
import type { Entry, EntryFilter } from "../types";

// ── Constants ─────────────────────────────────────────────────
// Fixed row height lets SectionList skip layout computation entirely (getItemLayout)
const ENTRY_ROW_HEIGHT = 72;
// ── Pure helpers (defined outside component — never recreated) ─
function groupByDate(entries: Entry[]) {
  const groups: Record<string, Entry[]> = {};
  for (const e of entries) {
    const key = format(new Date(e.entry_date), "yyyy-MM-dd");
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ title: key, data: groups[key] }));
}

function formatSectionTitle(key: string): string {
  const d = new Date(key);
  if (isToday(d)) return `Today, ${format(d, "dd MMMM yyyy")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "dd MMMM yyyy")}`;
  return format(d, "dd MMMM yyyy");
}

const FILTERS: { key: EntryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cash_in", label: "Cash In" },
  { key: "cash_out", label: "Cash Out" },
];

// ── EntryRow — memoised so only changed rows re-render ─────────
interface EntryRowProps {
  entry: Entry;
  isChosen: boolean;
  selectMode: boolean;
  isDark: boolean;
  currency: string | undefined;
  userId: string | undefined;
  surface: string;
  textColor: string;
  textTertiary: string;
  border: string;
  onPress: (e: Entry) => void;
  onLongPress: (e: Entry) => void;
  onDotPress: (e: Entry) => void;
}

const EntryRow = memo(function EntryRow({
  entry: e,
  isChosen,
  selectMode,
  isDark,
  currency,
  userId,
  surface,
  textColor,
  textTertiary,
  border,
  onPress,
  onLongPress,
  onDotPress,
}: EntryRowProps) {
  const isCashIn = e.type === "cash_in";
  const isMe = e.user_id === userId;
  const entryBy = e.profile?.full_name || e.profile?.email;
  const timeStr = format(new Date(e.entry_date), "h:mm a");

  const rowBg = isChosen
    ? isDark
      ? "rgba(91,95,237,0.25)"
      : "rgba(91,95,237,0.10)"
    : surface;

  return (
    <Pressable
      style={[s.entryRow, { backgroundColor: rowBg }]}
      onPress={() => onPress(e)}
      onLongPress={() => onLongPress(e)}
      delayLongPress={350}
      android_ripple={{ color: "rgba(91,95,237,0.12)" }}
    >
      {selectMode && (
        <View
          style={[
            s.checkbox,
            isChosen
              ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
              : { backgroundColor: "transparent", borderColor: border },
          ]}
        >
          {isChosen && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
      )}

      <View
        style={[
          s.typeBadge,
        ]}
      />

      <View style={s.entryContent}>
        <Text
          style={[
            s.entryAmt,
            { color: isCashIn ? COLORS.cashIn : COLORS.cashOut },
          ]}
        >
          {formatAmount(e.amount, currency)}
        </Text>
        {e.note ? (
          <Text style={[s.entryNote, { color: textColor }]} numberOfLines={1}>
            {e.note}
          </Text>
        ) : null}
        <View style={s.entryMeta}>
          {!isMe && entryBy ? (
            <Text style={[s.entryByText, { color: COLORS.primary }]}>
              {entryBy}
              {"  "}
            </Text>
          ) : null}
          <Text style={[s.entryTime, { color: textTertiary }]}>
            at {timeStr}
          </Text>
        </View>
      </View>

      {!selectMode && (
        <TouchableOpacity
          onPress={() => onDotPress(e)}
          style={s.dotBtn}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={textTertiary} />
        </TouchableOpacity>
      )}
    </Pressable>
  );
});

// ── Section header — memoised ──────────────────────────────────
const SectionHeader = memo(function SectionHeader({
  title,
  bgColor,
  textColor,
}: {
  title: string;
  bgColor: string;
  textColor: string;
}) {
  return (
    <View style={[s.sectionHeader, { backgroundColor: bgColor }]}>
      <Text style={[s.sectionHeaderText, { color: textColor }]}>
        {formatSectionTitle(title)}
      </Text>
    </View>
  );
});

// ── Main screen ────────────────────────────────────────────────
export default function BookDetailScreen({ route, navigation }: any) {
  const { bookId } = route.params;

  const {
    entries,
    isLoading,
    isLoadingMore,
    filter,
    summary,
    hasMore,
    fetchEntries,
    loadMore,
    deleteEntry,
    setFilter,
  } = useEntriesStore();
  const { currentBook, fetchBook } = useBooksStore();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const theme = getTheme(mode);
  const isDark = mode === "dark";

  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEntriesRealtime(bookId, currentBook?.name);

  useFocusEffect(
    useCallback(() => {
      fetchEntries(bookId);
      fetchBook(bookId);
      setSelectMode(false);
      setSelected(new Set());
    }, [bookId]),
  );

  // ── Stable callbacks — never recreated unless deps change ────
  const handleEntryPress = useCallback(
    (e: Entry) => {
      if (selectMode) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(e.id)) next.delete(e.id);
          else next.add(e.id);
          return next;
        });
      } else {
        navigation.navigate("AddEditEntry", {
          bookId,
          entry: e,
          currency: currentBook?.currency,
        });
      }
    },
    [selectMode, bookId, currentBook?.currency, navigation],
  );

  const handleEntryLongPress = useCallback(
    (e: Entry) => {
      if (!selectMode) {
        setSelectMode(true);
        setSelected(new Set([e.id]));
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(e.id)) next.delete(e.id);
          else next.add(e.id);
          return next;
        });
      }
    },
    [selectMode],
  );

  const handleDotPress = useCallback(
    (e: Entry) => {
      themedActionSheet(
        e.note || (e.type === "cash_in" ? "Cash In" : "Cash Out"),
        formatAmount(e.amount, currentBook?.currency),
        [
          {
            text: "Edit Entry",
            onPress: () =>
              navigation.navigate("AddEditEntry", {
                bookId,
                entry: e,
                currency: currentBook?.currency,
              }),
          },
          {
            text: "Delete Entry",
            style: "destructive" as const,
            onPress: () =>
              themedAlert(
                "Delete Entry",
                `Remove ${formatAmount(e.amount, currentBook?.currency)}${e.note ? ` "${e.note}"` : ""}?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      const { error } = await deleteEntry(e.id, bookId);
                      if (error) themedAlert("Error", error);
                    },
                  },
                ],
                "trash-outline",
              ),
          },
          { text: "Cancel", style: "cancel" as const },
        ],
      );
    },
    [currentBook?.currency, bookId, deleteEntry, navigation],
  );

  // ── Book three-dot ───────────────────────────────────────────
  const handleBookThreeDot = useCallback(() => {
    themedActionSheet(currentBook?.name || "Book", undefined, [
      {
        text: "Members",
        onPress: () =>
          navigation.navigate("Members", {
            bookId,
            bookName: currentBook?.name,
          }),
      },
      {
        text: "Delete All Entries",
        style: "destructive" as const,
        onPress: () =>
          themedAlert(
            "Delete All Entries?",
            `Permanently remove all ${entries.length} entries from "${currentBook?.name}"? This cannot be undone.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete All",
                style: "destructive",
                onPress: async () => {
                  const { error } = await supabase
                    .from("entries")
                    .delete()
                    .eq("book_id", bookId);
                  if (error) {
                    themedAlert("Error", error.message);
                    return;
                  }
                  await entriesService.invalidateBookCache(bookId);
                  fetchEntries(bookId);
                  fetchBook(bookId);
                },
              },
            ],
            "trash-outline",
          ),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }, [
    currentBook,
    bookId,
    entries.length,
    fetchEntries,
    fetchBook,
    navigation,
  ]);

  // ── Delete selected ──────────────────────────────────────────
  const handleDeleteSelected = useCallback(() => {
    const count = selected.size;
    themedAlert(
      `Delete ${count} Entr${count === 1 ? "y" : "ies"}?`,
      `Remove ${count} selected entr${count === 1 ? "y" : "ies"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            for (const id of Array.from(selected))
              await deleteEntry(id, bookId);
            setSelectMode(false);
            setSelected(new Set());
            fetchBook(bookId);
          },
        },
      ],
      "trash-outline",
    );
  }, [selected, bookId, deleteEntry, fetchBook]);

  // ── Header ───────────────────────────────────────────────────
  useEffect(() => {
    if (selectMode) {
      navigation.setOptions({
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => {
              setSelectMode(false);
              setSelected(new Set());
            }}
            style={{ padding: 4, marginLeft: 4 }}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        ),
        headerTitle: () => (
          <Text
            style={{
              fontSize: FONT_SIZE.md,
              fontWeight: "700",
              color: theme.text,
            }}
          >
            {selected.size} selected
          </Text>
        ),
        headerRight: () =>
          selected.size > 0 ? (
            <TouchableOpacity
              style={{ padding: 8, marginRight: 8 }}
              onPress={handleDeleteSelected}
            >
              <Ionicons name="trash-outline" size={22} color={COLORS.cashOut} />
            </TouchableOpacity>
          ) : null,
      });
    } else {
      navigation.setOptions({
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ padding: 4, marginLeft: 4 }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
        ),
        headerTitle: () => (
          <View>
            <Text
              style={{
                fontSize: FONT_SIZE.md,
                fontWeight: "700",
                color: theme.text,
              }}
            >
              {currentBook?.name || "Book"}
            </Text>
            <Text style={{ fontSize: FONT_SIZE.xs, color: theme.textTertiary }}>
              {currentBook?.currency || ""}
            </Text>
          </View>
        ),
        headerRight: () => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginRight: 8,
            }}
          >
            <TouchableOpacity
              style={{ padding: 6 }}
              onPress={() =>
                navigation.navigate("ExportImport", {
                  bookId,
                  bookName: currentBook?.name,
                })
              }
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={theme.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 6 }}
              onPress={handleBookThreeDot}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [
    selectMode,
    selected,
    currentBook,
    theme,
    handleDeleteSelected,
    handleBookThreeDot,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEntries(bookId), fetchBook(bookId)]);
    setRefreshing(false);
  }, [bookId, fetchEntries, fetchBook]);

  const onEndReached = useCallback(() => loadMore(bookId), [bookId, loadMore]);

  // ── Memoised sections — only recomputed when entries change ──
  const sections = useMemo(() => groupByDate(entries), [entries]);

  // ── Stable renderItem with useCallback ───────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryRow
        entry={item}
        isChosen={selected.has(item.id)}
        selectMode={selectMode}
        isDark={isDark}
        currency={currentBook?.currency}
        userId={user?.id}
        surface={theme.surface}
        textColor={theme.text}
        textTertiary={theme.textTertiary}
        border={theme.border}
        onPress={handleEntryPress}
        onLongPress={handleEntryLongPress}
        onDotPress={handleDotPress}
      />
    ),
    [
      selected,
      selectMode,
      isDark,
      currentBook?.currency,
      user?.id,
      theme,
      handleEntryPress,
      handleEntryLongPress,
      handleDotPress,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: any) => (
      <SectionHeader
        title={section.title}
        bgColor={theme.background}
        textColor={theme.textTertiary}
      />
    ),
    [theme],
  );

  const keyExtractor = useCallback((item: Entry) => item.id, []);

  const bal = summary?.balance ?? 0;

  return (
    <SafeAreaView
      style={[s.container, { backgroundColor: theme.background }]}
      edges={["bottom"]}
    >
      {/* Balance card */}
      <View style={[s.balanceCard, { backgroundColor: theme.surface }]}>
        <View style={s.balancePanelRow}>
          <Text style={[s.balancePanelLabel, { color: theme.textSecondary }]}>
            Net Balance
          </Text>
          <Text
            style={[
              s.balancePanelVal,
              { color: bal >= 0 ? COLORS.cashIn : COLORS.cashOut },
            ]}
          >
            {formatAmount(Math.abs(bal), currentBook?.currency)}
          </Text>
        </View>
        <View style={[s.balanceDivider, { backgroundColor: theme.border }]} />
        <View style={s.balanceSubRow}>
          <View style={s.balanceSubItem}>
            <Text style={[s.balanceSubLabel, { color: theme.textSecondary }]}>
              Total In (+)
            </Text>
            <Text style={[s.balanceSubVal, { color: COLORS.cashIn }]}>
              {formatAmount(summary?.cash_in || 0, currentBook?.currency)}
            </Text>
          </View>
          <View
            style={[s.balanceSubDivider, { backgroundColor: theme.border }]}
          />
          <View style={s.balanceSubItem}>
            <Text style={[s.balanceSubLabel, { color: theme.textSecondary }]}>
              Total Out (-)
            </Text>
            <Text style={[s.balanceSubVal, { color: COLORS.cashOut }]}>
              {formatAmount(summary?.cash_out || 0, currentBook?.currency)}
            </Text>
          </View>
        </View>
      </View>

      {/* Filter card */}
      <View style={[s.filterCard, { backgroundColor: theme.surface }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              s.filterTab,
              filter === f.key && {
                borderBottomColor: COLORS.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setFilter(f.key, bookId)}
          >
            <Text
              style={[
                s.filterTabText,
                {
                  color:
                    filter === f.key ? COLORS.primary : theme.textSecondary,
                },
                filter === f.key && { fontWeight: "700" },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={[s.entryCount, { color: theme.textTertiary }]}>
          {entries.length} entries
        </Text>
      </View>

      {/* Select-all banner */}
      {/* {selectMode && (
        <TouchableOpacity
          style={[
            s.selectBanner,
            {
              backgroundColor: COLORS.primaryLight,
              borderBottomColor: theme.border,
            },
          ]}
          onPress={() => {
            const allSelected =
              entries.length > 0 && selected.size === entries.length;
            setSelected(
              allSelected ? new Set() : new Set(entries.map((e) => e.id)),
            );
          }}
        >
          <Ionicons
            name={
              entries.length > 0 && selected.size === entries.length
                ? "checkbox"
                : "checkbox-outline"
            }
            size={18}
            color={COLORS.primary}
          />
          <Text style={[s.selectBannerText, { color: COLORS.primary }]}>
            {entries.length > 0 && selected.size === entries.length
              ? "Deselect All"
              : `Select All (${entries.length})`}
          </Text>
        </TouchableOpacity>
      )} */}

      {isLoading && entries.length === 0 ? (
        <View style={s.loader}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          // Performance tuning — getItemLayout removed: SectionList offsets
          // must account for section header heights too, or items won't render
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={15}
          windowSize={5}
          removeClippedSubviews={true}
          // Lazy loading
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={s.loadingMore}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text
                  style={[s.loadingMoreText, { color: theme.textTertiary }]}
                >
                  Loading more...
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons
                name="receipt-outline"
                size={44}
                color={theme.textTertiary}
              />
              <Text style={[s.emptyTitle, { color: theme.text }]}>
                No entries yet
              </Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
                Tap + to add your first entry
              </Text>
            </View>
          }
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {!selectMode && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: COLORS.primary }]}
          onPress={() =>
            navigation.navigate("AddEditEntry", {
              bookId,
              currency: currentBook?.currency,
            })
          }
          activeOpacity={0.88}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  list: { paddingBottom: 100 },

  balanceCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.sm,
  },
  balancePanelRow: { marginBottom: SPACING.sm },
  balancePanelLabel: { fontSize: FONT_SIZE.sm, marginBottom: 4 },
  balancePanelVal: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  balanceDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  balanceSubRow: { flexDirection: "row" },
  balanceSubItem: { flex: 1 },
  balanceSubDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: SPACING.md,
  },
  balanceSubLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
  balanceSubVal: { fontSize: FONT_SIZE.md, fontWeight: "700" },

  filterCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.sm,
    paddingHorizontal: SPACING.md,
  },
  filterTab: { paddingVertical: SPACING.sm, marginRight: SPACING.lg },
  filterTabText: { fontSize: FONT_SIZE.sm },
  entryCount: { marginLeft: "auto", fontSize: FONT_SIZE.xs },

  selectBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectBannerText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },

  sectionHeader: { paddingHorizontal: SPACING.lg, paddingVertical: 6 },
  sectionHeaderText: { fontSize: FONT_SIZE.xs, fontWeight: "600" },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    height: ENTRY_ROW_HEIGHT,
    // borderBottomWidth: StyleSheet.hairlineWidth,
    // adding marginBottom to create space between rows, since borderBottomWidth is removed for performance
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  // for space between checkbox and entry content
  typeBadge: {
    // paddingHorizontal: 7,
    // paddingVertical: 4,
    // borderRadius: BORDER_RADIUS.sm,
    // marginRight: SPACING.sm,
    width: 10,
    // alignItems: "center",
  },
  typeBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  entryContent: { flex: 1, justifyContent: "center" },
  entryAmt: { fontSize: FONT_SIZE.md, fontWeight: "700", lineHeight: 20 },
  // note is optional and can be long, so smaller font and single line with ellipsis
  entryNote: { fontSize: FONT_SIZE.sm, lineHeight: 16 },
  entryMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  entryByText: { fontSize: 10, fontWeight: "600" },
  entryTime: { fontSize: 10 },
  dotBtn: { padding: 4, paddingLeft: SPACING.sm },

  loadingMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  loadingMoreText: { fontSize: FONT_SIZE.sm },

  empty: { alignItems: "center", paddingTop: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: "700" },
  emptyBody: { fontSize: FONT_SIZE.sm },

  fab: {
    position: "absolute",
    bottom: SPACING.xl,
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5B5FED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
