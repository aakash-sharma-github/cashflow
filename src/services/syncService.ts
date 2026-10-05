// src/services/syncService.ts
// Replays pending offline operations against the remote Supabase DB.
//
// ARCHITECTURE: Everything is in one replayQueue() function.
// Previously split into replayQueue() + replayOne() — but replayOne()
// had no access to the allOps array, so CREATE_BOOK could not patch
// sibling CREATE_ENTRY operations' book_ids after syncing.
//
// The fix: inline all case logic directly inside replayQueue() so the
// allOps array is always in scope when CREATE_BOOK needs to patch it.

import supabase from "./supabase";
import { localBooksDb, localEntriesDb, localMetaDb } from "./localDb";
import type { PendingOperation } from "../store/offlineStore";
import { logger } from "../utils/logger";
import { normalizeEntryAmount } from "../utils/money";

export interface SyncResult {
  succeeded: string[];
  failed: string[];
  errors: Record<string, string>;
}

export const syncService = {
  async replayQueue(
    ops: PendingOperation[],
    userId: string,
  ): Promise<SyncResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      const message = "A valid Supabase session for this account is required before syncing";
      return { succeeded: [], failed: ops.map(op => op.id), errors: Object.fromEntries(ops.map(op => [op.id, message])) };
    }

    // Queue compaction preserves user order and removes canceled dependencies.
    // Never globally sort by operation type: deletes must remain after creates.
    const allOps = [...ops];

    const succeeded: string[] = [];
    const failed: string[] = [];
    const errors: Record<string, string> = {};

    for (const op of allOps) {
      const { type, payload } = op;
      logger.info(`[Sync] Processing ${type} (${op.id})`);

      // Never replay one account's pending financial changes under another
      // account's session. Legacy queue items have no owner marker and must
      // be migrated/claimed explicitly instead of guessed from auth timing.
      if (op.userId !== userId) {
        failed.push(op.id);
        errors[op.id] = op.userId
          ? "Queued change belongs to a different account"
          : "Queued change predates account scoping; verify its owner before syncing";
        continue;
      }

      try {
        switch (type) {
          // ── CREATE_BOOK ──────────────────────────────────────────
          case "CREATE_BOOK": {
            const { tempId, ...bookData } = payload;
            const serverId = bookData.serverId ?? bookData.bookId;
            const { serverId: _serverId, bookId: _bookId, attemptedOnline: _attemptedOnline, ...fields } = bookData;
            const { data, error } = serverId
              ? await supabase.rpc("sync_create_book", {
                  p_book_id: serverId,
                  p_name: fields.name,
                  p_description: fields.description || null,
                  p_color: fields.color || "#6366F1",
                  p_currency: fields.currency || "INR",
                })
              : await supabase.rpc("create_book", {
                  p_name: fields.name,
                  p_description: fields.description || null,
                  p_color: fields.color || "#6366F1",
                  p_currency: fields.currency || "INR",
                });

            if (error) {
              throw new Error(error.message);
            }

            if (data) {
              const realId = (data as any).id as string;

              // Replace a legacy temporary ID; current queue entries already
              // use the stable server UUID as their book ID.
              const books = await localBooksDb.getAll(userId);
              const updatedBooks = books.map((b) =>
                b.id === tempId
                  ? { ...b, ...(data as any), id: realId, role: "owner" as const, pending_sync: false }
                  : b.id === realId
                  ? { ...b, ...(data as any), role: "owner" as const, pending_sync: false }
                  : b,
              );
              await localBooksDb.save(userId, updatedBooks);

              if (tempId) {
                for (const siblingOp of allOps) {
                  if (siblingOp.id === op.id) continue;
                  if (siblingOp.payload.book_id === tempId) siblingOp.payload.book_id = realId;
                  if (siblingOp.payload.bookId === tempId) siblingOp.payload.bookId = realId;
                }
              }
            }
            break;
          }

          // ── UPDATE_BOOK ──────────────────────────────────────────
          case "UPDATE_BOOK": {
            const { bookId, book_id, ...updates } = payload;
            const targetId = bookId ?? book_id;
            const { data, error } = await supabase
              .from("books")
              .update(updates)
              .eq("id", targetId)
              .select("id")
              .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) throw new Error("Book update was not applied (book unavailable or not authorized)");
            break;
          }

          // ── DELETE_BOOK ──────────────────────────────────────────
          case "DELETE_BOOK": {
            const bookId = payload.bookId ?? payload.book_id;
            const { error } = await supabase.rpc("sync_delete_book", { p_book_id: bookId });
            if (error) throw new Error(error.message);
            await localBooksDb.remove(userId, bookId);
            await localEntriesDb.clearBook(userId, bookId);
            break;
          }

          // ── CREATE_ENTRY ─────────────────────────────────────────
          case "CREATE_ENTRY": {
            const { tempId, ...entryData } = payload;
            const serverId = entryData.serverId;
            delete entryData.serverId;
            delete entryData.attemptedOnline;
            const amount = normalizeEntryAmount(entryData.amount);
            if (!amount || !["cash_in", "cash_out"].includes(entryData.type)) {
              throw new Error("Queued entry has an invalid amount or type");
            }

            // If book_id is still a temp ID after sorting + patching above,
            // it means CREATE_BOOK failed earlier in this same sync run.
            // Throw so it stays in the queue and retries next sync.
            if (
              typeof entryData.book_id === "string" &&
              entryData.book_id.startsWith("local_")
            ) {
              logger.warn(
                "[Sync] CREATE_ENTRY: book_id still temp after patching —",
                entryData.book_id,
              );
              throw new Error("Book not yet synced — will retry");
            }

            const insertResult = await supabase
              .from("entries")
              .insert({ ...entryData, ...(serverId ? { id: serverId } : {}), amount, user_id: userId })
              .select("*, profile:profiles(id, email, full_name)")
              .single();
            let data = insertResult.data;
            const error = insertResult.error;

            if (error) {
              if (error.code !== "23505" || !serverId) throw new Error(error.message);
              const existing = await supabase
                .from("entries")
                .select("*, profile:profiles(id, email, full_name)")
                .eq("id", serverId)
                .eq("book_id", entryData.book_id)
                .eq("user_id", userId)
                .maybeSingle();
              if (existing.error || !existing.data) throw new Error(existing.error?.message ?? "Duplicate entry could not be verified");
              const refreshed = await supabase
                .from("entries")
                .update({ amount, type: entryData.type, note: entryData.note, entry_date: entryData.entry_date })
                .eq("id", serverId)
                .eq("book_id", entryData.book_id)
                .eq("user_id", userId)
                .select("*, profile:profiles(id, email, full_name)")
                .single();
              if (refreshed.error || !refreshed.data) throw new Error(refreshed.error?.message ?? "Replayed entry update was not applied");
              data = refreshed.data;
            }

            // Replace temp entry with server-confirmed entry in local cache
            if (tempId && data && entryData.book_id) {
              const cached = await localEntriesDb.getByBook(
                userId,
                entryData.book_id,
              );
              const replaced = cached.map((e) =>
                e.id === tempId ? { ...e, ...data } : e,
              );
              await localEntriesDb.save(userId, entryData.book_id, replaced);
              logger.info(
                `[Sync] Replaced temp entry ${tempId} → ${(data as any).id}`,
              );
            }

            // Also patch any UPDATE_ENTRY ops that reference the temp entry ID
            if (tempId && data) {
              const realEntryId = (data as any).id as string;
              for (const siblingOp of allOps) {
                if (siblingOp.id === op.id) continue;
                if (siblingOp.payload.entryId === tempId) {
                  siblingOp.payload.entryId = realEntryId;
                  logger.info(
                    `[Sync] Patched entryId ${tempId} → ${realEntryId} in ${siblingOp.type}`,
                  );
                }
              }
            }
            break;
          }

          // ── UPDATE_ENTRY ─────────────────────────────────────────
          case "UPDATE_ENTRY": {
            const { entryId, entry_id, bookId: _bookId, book_id: _book_id, ...updates } = payload;
            const targetId = entryId ?? entry_id;
            if (updates.amount !== undefined) {
              const amount = normalizeEntryAmount(updates.amount);
              if (!amount) throw new Error("Queued update has an invalid amount");
              updates.amount = amount;
            }

            // Still a temp ID = CREATE_ENTRY failed before this in same sync
            if (typeof targetId === "string" && targetId.startsWith("local_")) {
              logger.warn("[Sync] UPDATE_ENTRY: entryId still temp —", targetId);
              throw new Error("Entry not yet synced — will retry");
            }

            const { data, error } = await supabase
              .from("entries")
              .update(updates)
              .eq("id", targetId)
              .select("id")
              .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) throw new Error("Entry update was not applied (entry unavailable or not authorized)");
            break;
          }

          // ── DELETE_ENTRY ─────────────────────────────────────────
          case "DELETE_ENTRY": {
            const { entryId, entry_id, book_id } = payload;
            const targetId = entryId ?? entry_id;
            const bookId = payload.bookId ?? book_id;

            // If still a temp ID, the entry never reached the server
            if (typeof targetId === "string" && targetId.startsWith("local_")) {
              logger.info(
                "[Sync] DELETE_ENTRY: temp entry never on server — removing from cache only",
              );
              if (bookId) {
                const cached = await localEntriesDb.getByBook(userId, bookId);
                await localEntriesDb.save(
                  userId,
                  bookId,
                cached.filter((e) => e.id !== targetId),
                );
              }
              break; // treat as success
            }

            const { data: deleted, error } = await supabase.rpc("sync_delete_entry", {
              p_entry_id: targetId,
              p_book_id: bookId,
            });
            if (error) throw new Error(error.message);
            if (deleted !== true) throw new Error("Entry delete was not confirmed by the server");
            break;
          }

          case "DELETE_BOOK_ENTRIES": {
            const bookId = payload.bookId ?? payload.book_id;
            if (typeof bookId !== "string") throw new Error("Queued delete-all operation has no book ID");
            const { error } = await supabase.rpc("delete_book_entries", { p_book_id: bookId });
            if (error) throw new Error(error.message);
            await localEntriesDb.clearBook(userId, bookId);
            break;
          }

          default:
            logger.warn("[Sync] Unknown operation type:", type);
        }

        succeeded.push(op.id);
        logger.info(`[Sync] ✅ ${type} succeeded (${op.id})`);
      } catch (err: any) {
        failed.push(op.id);
        errors[op.id] = err.message || "Unknown error";
        logger.warn(`[Sync] ❌ ${type} failed (${op.id}):`, err.message);
      }
    }

    if (succeeded.length > 0) {
      await localMetaDb.setLastSync(userId, new Date().toISOString());
    }

    logger.info(
      `[Sync] Done — succeeded: ${succeeded.length}, failed: ${failed.length}`,
    );
    return { succeeded, failed, errors };
  },

  // ── Full refresh ───────────────────────────────────────────────
  // Fetches all remote books + entries and overwrites local cache.
  // Called after a successful sync or on first login while online.
  async fullRefresh(userId: string): Promise<void> {
    const [{ data: books }, { data: summaries }] = await Promise.all([
      supabase
      .from("books")
      .select(`*, book_members!inner(role, user_id)`)
      .eq("book_members.user_id", userId)
      .order("created_at", { ascending: false }),
      supabase.rpc("get_book_financial_summaries_exact", { p_book_id: null }),
    ]);

    if (!books || !summaries) return;
    const summaryByBook = new Map((summaries as any[]).map(summary => [summary.book_id, summary]));

    const enriched = books.map((book: any) => {
      const mine = book.book_members?.find((m: any) => m.user_id === userId);
      const summary: any = summaryByBook.get(book.id);
      if (!summary) return null;
      const { book_members, ...rest } = book;
      return {
        ...rest,
        role: mine?.role,
        cash_in: String(summary.cash_in),
        cash_out: String(summary.cash_out),
        balance: String(summary.balance),
        member_count: Number(summary.member_count),
      };
    });

    const validBooks = enriched.filter((book): book is NonNullable<typeof book> => Boolean(book));
    await localBooksDb.save(userId, validBooks);

    for (const book of validBooks) {
      const { data: entries } = await supabase
        .from("entries")
        .select("*, profile:profiles(id, email, full_name)")
        .eq("book_id", book.id)
        .order("entry_date", { ascending: false })
        .limit(100);

      if (entries) await localEntriesDb.save(userId, book.id, entries);
    }

    await localMetaDb.setLastSync(userId, new Date().toISOString());
  },
};
