// src/components/common/OfflineBanner.tsx — Redesigned v2
import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useOfflineStore } from '../../store/offlineStore'
import { COLORS, FONT_SIZE, SPACING } from '../../constants'

export default function OfflineBanner() {
  const { isOnline, pendingQueue, isSyncing } = useOfflineStore()
  const anim = useRef(new Animated.Value(-44)).current
  const shouldShow = !isOnline || isSyncing || pendingQueue.length > 0

  useEffect(() => {
    Animated.spring(anim, {
      toValue: shouldShow ? 0 : -44,
      useNativeDriver: true,
      tension: 120, friction: 12,
    }).start()
  }, [shouldShow])

  const bgColor = !isOnline ? '#EF4444' : isSyncing ? '#F59E0B' : '#10B981'
  const icon = !isOnline ? 'cloud-offline-outline' : isSyncing ? 'sync-outline' : 'cloud-done-outline'
  const msg = !isOnline
    ? `Offline${pendingQueue.length > 0 ? ` · ${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''} queued` : ''}`
    : isSyncing ? 'Syncing changes...'
    : `Synced · ${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''} uploaded`

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: bgColor, transform: [{ translateY: anim }] }]}
      pointerEvents="none"
    >
      <Ionicons name={icon as any} size={14} color="#fff" />
      <Text style={styles.text}>{msg}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 7, paddingHorizontal: SPACING.lg,
  },
  text: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: '700', letterSpacing: 0.2 },
})
