// src/screens/MembersScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { invitationsService } from "../services/invitationsService";
import { useBooksStore } from "../store/booksStore";
import { useAuthStore } from "../store/authStore";
import { useThemeStore, getTheme } from "../store/themeStore";
import { useBookMembersRealtime } from "../hooks/useEntriesRealtime";
import {
  themedAlert,
  themedActionSheet,
} from "../components/common/ThemedAlert";
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZE,
  SHADOW,
} from "../constants";
import {
  isValidEmail,
  getInitials,
  getDisplayName,
  formatRelativeTime,
} from "../utils";
import type { BookMember, Invitation } from "../types";

type TabKey = "members" | "invitations";

export default function MembersScreen({ route }: any) {
  const { bookId } = route.params;
  const { currentBook } = useBooksStore();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const theme = getTheme(mode);

  const [tab, setTab] = useState<TabKey>("members");
  const [members, setMembers] = useState<BookMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [sending, setSending] = useState(false);

  const isOwner = currentBook?.role === "owner";

  const load = useCallback(async () => {
    const [mRes, iRes] = await Promise.all([
      invitationsService.getBookMembers(bookId),
      invitationsService.getBookInvitations(bookId),
    ]);
    if (mRes.data) setMembers(mRes.data);
    if (iRes.data) setInvitations(iRes.data);
    setLoading(false);
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);
  useBookMembersRealtime(bookId, load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      themedAlert("Invalid Email", "Please enter a valid email.");
      return;
    }
    if (email === user?.email) {
      themedAlert("Oops", "You cannot invite yourself.");
      return;
    }
    setSending(true);
    const { error } = await invitationsService.sendInvitation(
      bookId,
      email,
      currentBook?.name || "Book",
    );
    setSending(false);
    if (error) {
      themedAlert("Could Not Send", error);
      return;
    }
    setInviteEmail("");
    await load();
    themedAlert(
      "Invitation Sent! 🎉",
      `${email} will receive an email invite.`,
    );
  };

  const handleRemoveMember = (m: BookMember) => {
    themedAlert("Remove Member", `Remove ${getDisplayName(m.profile)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const { error } = await invitationsService.removeMember(
            bookId,
            m.user_id,
          );
          if (error) themedAlert("Error", error);
          else load();
        },
      },
    ]);
  };

  const statusConfig: Record<
    string,
    { bg: string; text: string; icon: string }
  > = {
    pending: {
      bg: COLORS.primaryLight,
      text: COLORS.primary,
      icon: "time-outline",
    },
    accepted: {
      bg: COLORS.cashInLight,
      text: COLORS.cashIn,
      icon: "checkmark-circle-outline",
    },
    rejected: {
      bg: COLORS.cashOutLight,
      text: COLORS.cashOut,
      icon: "close-circle-outline",
    },
  };

  const handleMemberThreeDot = (m: BookMember) => {
    // Only owner can manage members, can't remove owner or self
    if (!isOwner || m.role === "owner" || m.user_id === user?.id) return;
    themedActionSheet(getDisplayName(m.profile), m.profile?.email, [
      {
        text: "Remove Member",
        style: "destructive" as const,
        onPress: () => handleRemoveMember(m),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const renderMember = ({ item: m }: { item: BookMember }) => {
    const canManage = isOwner && m.role !== "owner" && m.user_id !== user?.id;
    return (
      <View style={[s.row, { backgroundColor: theme.surface }]}>
        <LinearGradient
          colors={
            m.role === "owner" ? ["#5B5FED", "#7C3AED"] : ["#9CA3AF", "#6B7280"]
          }
          style={s.avatar}
        >
          <Text style={s.avatarText}>
            {getInitials(m.profile?.full_name || m.profile?.email || "?")}
          </Text>
        </LinearGradient>
        <View style={s.rowInfo}>
          <Text style={[s.rowName, { color: theme.text }]}>
            {getDisplayName(m.profile)}
            {m.user_id === user?.id ? " (You)" : ""}
          </Text>
          <Text style={[s.rowEmail, { color: theme.textTertiary }]}>
            {m.profile?.email}
          </Text>
        </View>
        <View
          style={[
            s.rolePill,
            {
              backgroundColor:
                m.role === "owner"
                  ? COLORS.primaryLight
                  : theme.surfaceSecondary,
            },
          ]}
        >
          {m.role === "owner" && (
            <Ionicons name="star" size={11} color={COLORS.primary} />
          )}
          <Text
            style={[
              s.roleText,
              {
                color:
                  m.role === "owner" ? COLORS.primary : theme.textSecondary,
              },
            ]}
          >
            {m.role === "owner" ? " Owner" : "Member"}
          </Text>
        </View>
        {/* Three-dot menu — visible only to owner for non-owner members */}
        {canManage ? (
          <TouchableOpacity
            onPress={() => handleMemberThreeDot(m)}
            style={s.memberDotBtn}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={18}
              color={theme.textTertiary}
            />
          </TouchableOpacity>
        ) : (
          <View style={s.memberDotBtn} />
        )}
      </View>
    );
  };

  const renderInvite = ({ item: inv }: { item: Invitation }) => {
    const cfg = statusConfig[inv.status] || statusConfig.pending;
    return (
      <View style={[s.row, { backgroundColor: theme.surface }]}>
        <View
          style={[
            s.avatar,
            { backgroundColor: theme.border, borderRadius: 22 },
          ]}
        >
          <Text style={[s.avatarText, { color: theme.textSecondary }]}>
            {getInitials(inv.invitee_email)}
          </Text>
        </View>
        <View style={s.rowInfo}>
          <Text style={[s.rowName, { color: theme.text }]} numberOfLines={1}>
            {inv.invitee_email}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons
              name="time-outline"
              size={11}
              color={theme.textTertiary}
            />
            <Text style={[s.rowEmail, { color: theme.textTertiary }]}>
              {formatRelativeTime(inv.created_at)}
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
          }}
        >
          <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={11} color={cfg.text} />
            <Text style={[s.statusText, { color: cfg.text }]}>
              {" "}
              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
            </Text>
          </View>
          {inv.status === "pending" && isOwner && (
            <TouchableOpacity
              onPress={async () => {
                await invitationsService.cancelInvitation(inv.id);
                load();
              }}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={COLORS.cashOut}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[s.container, { backgroundColor: theme.background }]}
      edges={["bottom"]}
    >
      {/* Invite bar */}
      {isOwner && (
        <View
          style={[
            s.inviteBar,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <Text style={[s.inviteLabel, { color: theme.textSecondary }]}>
            Invite by Email
          </Text>
          <View style={s.inviteRow}>
            <View
              style={[
                s.inviteInputWrap,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
                emailFocused && {
                  borderColor: COLORS.primary,
                  backgroundColor: mode === 'dark'
                    ? theme.surfaceSecondary   // darker surface for dark mode
                    : COLORS.primaryLight      // keep light for light mode
                },
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={16}
                color={emailFocused ? COLORS.primary : theme.textTertiary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={[s.inviteInput, { color: theme.text }]}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="colleague@example.com"
                placeholderTextColor={theme.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmitEditing={handleSendInvite}
                returnKeyType="send"
              />
            </View>
            <TouchableOpacity
              style={[s.sendBtn, sending && { opacity: 0.6 }]}
              onPress={handleSendInvite}
              disabled={sending}
            >
              <LinearGradient
                colors={["#5B5FED", "#7C3AED"]}
                style={s.sendBtnGrad}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send-outline" size={16} color="#fff" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={[s.tabRow, { backgroundColor: theme.background }]}>
        {(["members", "invitations"] as TabKey[]).map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              style={[
                s.tabBtn,
                { backgroundColor: theme.surface, borderColor: theme.border },
                active && {
                  borderColor: COLORS.primary,
                  backgroundColor: COLORS.primaryLight,
                },
              ]}
              onPress={() => setTab(t)}
            >
              <Ionicons
                name={t === "members" ? "people-outline" : "mail-outline"}
                size={15}
                color={active ? COLORS.primary : theme.textSecondary}
              />
              <Text
                style={[
                  s.tabLabel,
                  { color: active ? COLORS.primary : theme.textSecondary },
                ]}
              >
                {t === "members"
                  ? `Members (${members.length})`
                  : `Invites (${invitations.length})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : tab === "members" ? (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          renderItem={renderMember}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(i) => i.id}
          renderItem={renderInvite}
          contentContainerStyle={[s.list, !invitations.length && s.listFlex]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons
                name="mail-open-outline"
                size={40}
                color={theme.textTertiary}
              />
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>
                No invitations sent yet
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  inviteBar: { padding: SPACING.md, borderBottomWidth: 1 },
  inviteLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: "700",
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  inviteRow: { flexDirection: "row", gap: SPACING.sm },
  inviteInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  inviteInput: { flex: 1, fontSize: FONT_SIZE.sm },
  sendBtn: { borderRadius: BORDER_RADIUS.md, overflow: "hidden" },
  sendBtnGrad: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  tabRow: { flexDirection: "row", padding: SPACING.md, gap: SPACING.sm },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
  },
  tabLabel: { fontSize: FONT_SIZE.sm, fontWeight: "600" },

  list: { paddingHorizontal: SPACING.md, paddingBottom: 40 },
  listFlex: { flex: 1 },
  memberDotBtn: { padding: 6, marginLeft: 8 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: 8,
    ...SHADOW.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: FONT_SIZE.md },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FONT_SIZE.md, fontWeight: "600", marginBottom: 2 },
  rowEmail: { fontSize: FONT_SIZE.xs },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleText: { fontSize: FONT_SIZE.xs, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: { fontSize: FONT_SIZE.xs, fontWeight: "700" },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: SPACING["2xl"],
    gap: SPACING.md,
  },
  emptyText: { fontSize: FONT_SIZE.md },
});
