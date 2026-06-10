// src/components/common/OfflineBanner.tsx
// Shows 4 states:
//   1. Offline          → red   · "Offline · N changes queued"
//   2. Syncing          → amber · "Syncing N changes..."
//   3. Sync error       → red   · "N operations failed to sync · Tap to retry"
//   4. Back online      → green · "Back online · all synced" (auto-hides after 3s)
//
// Tapping the banner when there's a sync error triggers a retry.

import React, { useEffect, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useOfflineStore } from '../../store/offlineStore'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { FONT_SIZE, SPACING } from '../../constants'

export default function OfflineBanner() {
  const { isOnline, pendingQueue, isSyncing, syncError, clearSyncError } = useOfflineStore()
  const { runSync } = useOfflineSync()

  const anim = useRef(new Animated.Value(-48)).current
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevOnline = useRef(isOnline)

  // Show / hide logic
  const hasError = !!syncError
  const hasPending = pendingQueue.length > 0
  const shouldShow = !isOnline || isSyncing || hasError || hasPending

  useEffect(() => {
    // Clear any existing auto-hide timer
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }

    const justCameOnline = !prevOnline.current === false && isOnline && prevOnline.current === false
    prevOnline.current = isOnline

    if (shouldShow) {
      // Slide down
      Animated.spring(anim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 12,
      }).start()
    } else {
      // Auto-hide after 3s when all clear (back online + no pending)
      hideTimer.current = setTimeout(() => {
        Animated.spring(anim, {
          toValue: -48,
          useNativeDriver: true,
          tension: 120,
          friction: 12,
        }).start()
      }, 3000)
    }
  }, [shouldShow, isOnline])

  // Determine visual state (priority order)
  let bgColor: string
  let icon: string
  let msg: string
  let tappable = false

  if (!isOnline) {
    bgColor = '#EF4444'
    icon = 'cloud-offline-outline'
    msg = pendingQueue.length > 0
      ? `Offline · ${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''} queued`
      : 'Offline'
  } else if (hasError) {
    bgColor = '#DC2626'
    icon = 'warning-outline'
    msg = `${syncError} · Tap to retry`
    tappable = true
  } else if (isSyncing) {
    bgColor = '#F59E0B'
    icon = 'sync-outline'
    msg = `Syncing ${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''}...`
  } else if (hasPending) {
    bgColor = '#F59E0B'
    icon = 'cloud-upload-outline'
    msg = `${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''} pending sync`
  } else {
    // All clear — back online or fully synced
    bgColor = '#10B981'
    icon = 'cloud-done-outline'
    msg = 'Back online · all synced'
  }

  const handleTap = useCallback(() => {
    if (tappable && syncError) {
      clearSyncError()
      runSync()
    }
  }, [tappable, syncError, clearSyncError, runSync])

  return (
    <Animated.View
      style={[s.container, { transform: [{ translateY: anim }] }]}
      pointerEvents={tappable ? 'box-none' : 'none'}
    >
      <TouchableOpacity
        style={[s.banner, { backgroundColor: bgColor }]}
        onPress={handleTap}
        disabled={!tappable}
        activeOpacity={tappable ? 0.85 : 1}
      >
        <Ionicons name={icon as any} size={13} color="#fff" />
        <Text style={s.text} numberOfLines={1}>{msg}</Text>
        {tappable && (
          <Ionicons name="refresh-outline" size={13} color="rgba(255,255,255,0.8)" />
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: SPACING.lg,
  },
  text: {
    color: '#fff',
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
})