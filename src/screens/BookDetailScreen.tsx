// src/screens/BookDetailScreen.tsx
// Features: lazy-loaded entries (onEndReached), multi-select with long-press,
// delete-selected from header, delete-all-entries option in book three-dot menu.
import React, { useEffect, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  SectionList,
  Animated,
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

// ── Group entries by date ────────────────────────────────────────────────
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

  const [refreshing, setRefreshing] = useState(false);
  // ── Multi-select state ───────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEntriesRealtime(bookId);

  useFocusEffect(
    useCallback(() => {
      fetchEntries(bookId);
      fetchBook(bookId);
      // Reset selection when screen comes into focus
      setSelectMode(false);
      setSelected(new Set());
    }, [bookId]),
  );

  // ── Header: switches between normal and selection mode ───────
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
  }, [selectMode, selected, currentBook, theme]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchEntries(bookId), fetchBook(bookId)]);
    setRefreshing(false);
  };

  // ── Book three-dot: Members + Delete All Entries ─────────────
  const handleBookThreeDot = () => {
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
            `This will permanently remove all ${entries.length} entries from "${currentBook?.name}". The book itself will remain. This cannot be undone.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete All",
                style: "destructive",
                onPress: async () => {
                  // Delete all entries for this book directly via Supabase
                  const { error } = await supabase
                    .from("entries")
                    .delete()
                    .eq("book_id", bookId);
                  if (error) {
                    themedAlert("Error", error.message);
                  } else {
                    // Invalidate cache so offline list updates too
                    await entriesService.invalidateBookCache(bookId);
                    fetchEntries(bookId);
                    fetchBook(bookId);
                  }
                },
              },
            ],
            "trash-outline",
          ),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  // ── Entry three-dot: Edit + Delete ───────────────────────────
  const handleEntryThreeDot = (e: Entry) => {
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
  };

  // ── Multi-select: delete selected entries ────────────────────
  const handleDeleteSelected = () => {
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
            // Delete all selected entries
            const ids = Array.from(selected);
            for (const id of ids) {
              await deleteEntry(id, bookId);
            }
            setSelectMode(false);
            setSelected(new Set());
            fetchBook(bookId);
          },
        },
      ],
      "trash-outline",
    );
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bal = summary?.balance ?? 0;
  const sections = groupByDate(entries);

  // ── Render single entry row ───────────────────────────────────
  const renderEntry = ({ item: e }: { item: Entry }) => {
    const isCashIn = e.type === "cash_in";
    const isMe = e.user_id === user?.id;
    const entryBy = e.profile?.full_name || e.profile?.email;
    const timeStr = format(new Date(e.entry_date), "h:mm a");
    const isChosen = selected.has(e.id);

    return (
      <Pressable
        style={({ pressed }) => [
          s.entryRow,
          {
            backgroundColor: isChosen
              ? mode === "dark"
                ? "rgba(91,95,237,0.25)"
                : "rgba(91,95,237,0.10)"
              : theme.surface,
          },
          pressed && { opacity: 0.82 },
        ]}
        onPress={() => {
          if (selectMode) {
            toggleSelect(e.id);
          } else {
            navigation.navigate("AddEditEntry", {
              bookId,
              entry: e,
              currency: currentBook?.currency,
            });
          }
        }}
        onLongPress={() => {
          // Long press activates selection mode
          if (!selectMode) {
            setSelectMode(true);
            setSelected(new Set([e.id]));
          } else {
            toggleSelect(e.id);
          }
        }}
        delayLongPress={350}
      >
        {/* Selection checkbox */}
        {selectMode && (
          <View
            style={[
              s.checkbox,
              isChosen
                ? {
                  backgroundColor: COLORS.primary,
                  borderColor: COLORS.primary,
                }
                : { backgroundColor: "transparent", borderColor: theme.border },
            ]}
          >
            {isChosen && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        )}

        {/* Type badge */}
        {/* <View
          style={[
            s.typeBadge,
            {
              backgroundColor: isCashIn
                ? COLORS.cashInDark
                : COLORS.cashOutDark,
            },
          ]}
        >
          <Text
            style={[
              s.typeBadgeText,
              { color: isCashIn ? COLORS.cashIn : COLORS.cashOut },
            ]}
          >
            Cash
          </Text>
        </View> */}

        {/* Content */}
        <View style={s.entryContent}>
          <View style={s.entryTopRow}>
            <Text
              style={[
                s.entryAmt,
                { color: isCashIn ? COLORS.cashIn : COLORS.cashOut },
              ]}
            >
              {formatAmount(e.amount, currentBook?.currency)}
            </Text>
          </View>
          {e.note ? (
            <Text
              style={[s.entryNote, { color: theme.text }]}
              numberOfLines={1}
            >
              {e.note}
            </Text>
          ) : null}
          <View style={s.entryMeta}>
            {!isMe && entryBy ? (
              <Text style={[s.entryByText, { color: COLORS.primary }]}>
                Entry by {entryBy}
                {"  "}
              </Text>
            ) : null}
            <Text style={[s.entryTime, { color: theme.textTertiary }]}>
              at {timeStr}
            </Text>
          </View>
        </View>

        {/* Three-dot (hidden in select mode) */}
        {!selectMode && (
          <TouchableOpacity
            onPress={() => handleEntryThreeDot(e)}
            style={s.dotBtn}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={16}
              color={theme.textTertiary}
            />
          </TouchableOpacity>
        )}
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }: any) => (
    <View style={[s.sectionHeader, { backgroundColor: theme.background }]}>
      <Text style={[s.sectionHeaderText, { color: theme.textTertiary }]}>
        {formatSectionTitle(section.title)}
      </Text>
    </View>
  );

  // ── Select-all/deselect-all banner ───────────────────────────
  // const SelectBanner = () => {
  //   if (!selectMode) return null;
  //   const allSelected = entries.length > 0 && selected.size === entries.length;
  //   return (
  //     <TouchableOpacity
  //       style={[
  //         s.selectBanner,
  //         {
  //           backgroundColor: COLORS.primaryLight,
  //           borderBottomColor: theme.border,
  //         },
  //       ]}
  //       onPress={() => {
  //         if (allSelected) setSelected(new Set());
  //         else setSelected(new Set(entries.map((e) => e.id)));
  //       }}
  //     >
  //       <Ionicons
  //         name={allSelected ? "checkbox" : "checkbox-outline"}
  //         size={18}
  //         color={COLORS.primary}
  //       />
  //       <Text style={[s.selectBannerText, { color: COLORS.primary }]}>
  //         {allSelected ? "Deselect All" : `Select All (${entries.length})`}
  //       </Text>
  //     </TouchableOpacity>
  //   );
  // };

  return (
    <SafeAreaView
      style={[s.container, { backgroundColor: theme.background }]}
      edges={["bottom"]}
    >
      {/* Balance card */}
      <View style={[s.balanceCard, { backgroundColor: theme.surface }]}>
        <View style={s.balancePanelRow}>
          <View style={s.balancePanelItem}>
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

      {/* Filter tabs */}
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

      {/* Select all banner */}
      {/* <SelectBanner /> */}

      {/* Entry list with lazy loading */}
      {isLoading && entries.length === 0 ? (
        <View style={s.loader}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          renderItem={renderEntry}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          // ── Lazy loading ───────────────────────────────────
          onEndReached={() => loadMore(bookId)}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* FAB — hidden in select mode */}
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

  // Balance card
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
  balancePanelItem: {},
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

  // Filter card
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

  // Select all banner
  selectBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectBannerText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },

  // Section header
  sectionHeader: { paddingHorizontal: SPACING.lg, paddingVertical: 6 },
  sectionHeaderText: { fontSize: FONT_SIZE.xs, fontWeight: "600" },

  // Entry row
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  typeBadgeText: { fontSize: 11, fontWeight: "700" },
  entryContent: { flex: 1 },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 2,
  },
  entryAmt: { fontSize: FONT_SIZE.lg, fontWeight: "700" },
  entryNote: { fontSize: FONT_SIZE.sm, marginBottom: 3 },
  entryMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  entryByText: { fontSize: FONT_SIZE.xs, fontWeight: "600" },
  entryTime: { fontSize: FONT_SIZE.xs },
  dotBtn: { padding: 4, paddingLeft: SPACING.sm, marginTop: 2 },

  // Lazy loading footer
  loadingMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  loadingMoreText: { fontSize: FONT_SIZE.sm },

  // Empty
  empty: { alignItems: "center", paddingTop: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: "700" },
  emptyBody: { fontSize: FONT_SIZE.sm },

  // FAB
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
