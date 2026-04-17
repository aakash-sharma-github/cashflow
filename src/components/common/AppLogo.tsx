// src/components/common/AppLogo.tsx
// Centralised app logo component using the real icon.png asset.
// Use this everywhere instead of the 💰 emoji.
//
// NOTE: Do NOT use this in navigation/index.tsx splash screen — that renders
// before the Expo asset pipeline is ready, which causes ExpoAsset.downloadAsync
// to fail. The splash uses a pure LinearGradient+emoji instead.
// This component is safe to use in all screens rendered after NavigationContainer.

import React from 'react'
import { Image, View, StyleSheet } from 'react-native'
import { BORDER_RADIUS } from '../../constants'

interface AppLogoProps {
    size?: number
    borderRadius?: number
    style?: object
}

export default function AppLogo({ size = 64, borderRadius, style }: AppLogoProps) {
    const r = borderRadius ?? Math.round(size * 0.22)  // iOS icon corner ratio
    return (
        <View style={[s.wrap, { width: size, height: size, borderRadius: r }, style]}>
            <Image
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                source={require('../../../assets/icon.png')}
                style={{ width: size, height: size, borderRadius: r }}
                resizeMode="cover"
            />
        </View>
    )
}

const s = StyleSheet.create({
    wrap: { overflow: 'hidden' },
})