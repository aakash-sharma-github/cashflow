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
    // ── Sort: CREATE_BOOK must always run before CREATE_ENTRY ──
    // When a book and its entries are both created offline, the book
    // gets a temp ID (local_xxx). All entry ops store book_id = local_xxx.
    // After CREATE_BOOK syncs, we patch the real UUID into the entry ops
    // in-place. The sort ensures this patching happens before any entry runs.
    const ORDER: Record<string, number> = {
      CREATE_BOOK: 0,
      UPDATE_BOOK: 1,
      DELETE_BOOK: 2,
      CREATE_ENTRY: 3,
      UPDATE_ENTRY: 4,
      DELETE_ENTRY: 5,
    };
    ops.sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9));

    // allOps is in scope for the entire loop — CREATE_BOOK mutates
    // payload.book_id on sibling ops so later iterations see the real UUID
    const allOps = ops;

    const succeeded: string[] = [];
    const failed: string[] = [];
    const errors: Record<string, string> = {};

    for (const op of allOps) {
      const { type, payload } = op;
      logger.info(`[Sync] Processing ${type} (${op.id})`);

      try {
        switch (type) {
          // ── CREATE_BOOK ──────────────────────────────────────────
          case "CREATE_BOOK": {
            const { tempId, ...bookData } = payload;

            const { data, error } = await supabase.rpc("create_book", {
              p_name: bookData.name,
              p_description: bookData.description || null,
              p_color: bookData.color || "#6366F1",
              p_currency: bookData.currency || "INR",
            });

            if (error) {
              // 23505 = unique_violation — book already created (previous sync partially succeeded)
              if (error.code === "23505") {
                logger.warn(
                  "[Sync] CREATE_BOOK duplicate — treating as success",
                );
                break;
              }
              throw new Error(error.message);
            }

            if (tempId && data) {
              const realId = (data as any).id as string;

              // Update local book cache: replace temp ID with real server ID
              const books = await localBooksDb.getAll(userId);
              const updatedBooks = books.map((b) =>
                b.id === tempId
                  ? { ...b, ...(data as any), role: "owner" as const }
                  : b,
              );
              await localBooksDb.save(userId, updatedBooks);

              // ─── PATCH SIBLING OPS ─────────────────────────────
              // Walk ALL pending ops and replace any book_id or entryId
              // that still references the temp book ID with the real UUID.
              // This is the critical fix — allOps is directly in scope here.
              let patched = 0;
              for (const siblingOp of allOps) {
                if (siblingOp.id === op.id) continue; // skip self
                if (siblingOp.payload.book_id === tempId) {
                  siblingOp.payload.book_id = realId;
                  patched++;
                }
              }
              if (patched > 0) {
                logger.info(
                  `[Sync] Patched book_id ${tempId} → ${realId} in ${patched} sibling op(s)`,
                );
              }
            }
            break;
          }

          // ── UPDATE_BOOK ──────────────────────────────────────────
          case "UPDATE_BOOK": {
            const { bookId, ...updates } = payload;
            const { error } = await supabase
              .from("books")
              .update(updates)
              .eq("id", bookId);
            if (error) throw new Error(error.message);
            break;
          }

          // ── DELETE_BOOK ──────────────────────────────────────────
          case "DELETE_BOOK": {
            const { error } = await supabase
              .from("books")
              .delete()
              .eq("id", payload.bookId);
            if (error) throw new Error(error.message);
            break;
          }

          // ── CREATE_ENTRY ─────────────────────────────────────────
          case "CREATE_ENTRY": {
            const { tempId, ...entryData } = payload;

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

            const { data, error } = await supabase
              .from("entries")
              .insert({ ...entryData, user_id: userId })
              .select("*, profile:profiles(id, email, full_name)")
              .single();

            if (error) {
              // Duplicate — already created in a previous sync attempt
              if (error.code === "23505") {
                logger.warn(
                  "[Sync] CREATE_ENTRY duplicate — treating as success",
                );
                if (tempId && entryData.book_id) {
                  const cached = await localEntriesDb.getByBook(
                    userId,
                    entryData.book_id,
                  );
                  await localEntriesDb.save(
                    userId,
                    entryData.book_id,
                    cached.filter((e) => e.id !== tempId),
                  );
                }
                break;
              }
              throw new Error(error.message);
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
            const { entryId, book_id: _bookId, ...updates } = payload;

            // Still a temp ID = CREATE_ENTRY failed before this in same sync
            if (typeof entryId === "string" && entryId.startsWith("local_")) {
              logger.warn("[Sync] UPDATE_ENTRY: entryId still temp —", entryId);
              throw new Error("Entry not yet synced — will retry");
            }

            const { error } = await supabase
              .from("entries")
              .update(updates)
              .eq("id", entryId);
            if (error) throw new Error(error.message);
            break;
          }

          // ── DELETE_ENTRY ─────────────────────────────────────────
          case "DELETE_ENTRY": {
            const { entryId, book_id: bookId } = payload;

            // If still a temp ID, the entry never reached the server
            if (typeof entryId === "string" && entryId.startsWith("local_")) {
              logger.info(
                "[Sync] DELETE_ENTRY: temp entry never on server — removing from cache only",
              );
              if (bookId) {
                const cached = await localEntriesDb.getByBook(userId, bookId);
                await localEntriesDb.save(
                  userId,
                  bookId,
                  cached.filter((e) => e.id !== entryId),
                );
              }
              break; // treat as success
            }

            const { error } = await supabase
              .from("entries")
              .delete()
              .eq("id", entryId);
            if (error) throw new Error(error.message);
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
    const { data: books } = await supabase
      .from("books")
      .select(`*, book_members!inner(role, user_id), entries(amount, type)`)
      .eq("book_members.user_id", userId)
      .order("created_at", { ascending: false });

    if (!books) return;

    const enriched = books.map((book: any) => {
      const mine = book.book_members?.find((m: any) => m.user_id === userId);
      const cashIn = (book.entries || [])
        .filter((e: any) => e.type === "cash_in")
        .reduce((s: number, e: any) => s + Number(e.amount), 0);
      const cashOut = (book.entries || [])
        .filter((e: any) => e.type === "cash_out")
        .reduce((s: number, e: any) => s + Number(e.amount), 0);
      const { entries, book_members, ...rest } = book;
      return {
        ...rest,
        role: mine?.role,
        cash_in: cashIn,
        cash_out: cashOut,
        balance: cashIn - cashOut,
        member_count: book.book_members?.length || 1,
      };
    });

    await localBooksDb.save(userId, enriched);

    for (const book of enriched) {
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
