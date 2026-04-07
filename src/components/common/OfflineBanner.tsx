// src/components/common/OfflineBanner.tsx
import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { useOfflineStore } from '../../store/offlineStore'
import { COLORS, FONT_SIZE, SPACING } from '../../constants'

export default function OfflineBanner() {
  const { isOnline, pendingQueue, isSyncing } = useOfflineStore()
  const slideAnim = useRef(new Animated.Value(-50)).current
  const shouldShow = !isOnline || isSyncing || pendingQueue.length > 0

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -50,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start()
  }, [shouldShow])

  const bgColor = !isOnline
    ? COLORS.cashOut
    : isSyncing
      ? COLORS.warning
      : COLORS.cashIn

  const message = !isOnline
    ? `📵 Offline — ${pendingQueue.length > 0 ? `${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''} queued` : 'changes saved locally'}`
    : isSyncing
      ? '🔄 Syncing changes...'
      : `✅ Synced — ${pendingQueue.length} change${pendingQueue.length > 1 ? 's' : ''} uploaded`

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
