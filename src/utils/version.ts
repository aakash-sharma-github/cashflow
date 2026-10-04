// src/utils/version.ts
// Single source of truth for the app version at runtime.
// Reads from expo-constants which pulls from app.json at build time.
// This means you never hardcode version strings in your UI.

import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { Platform } from 'react-native'

const isExpoGo = Constants.appOwnership === 'expo'
const configuredVersion = Constants.expoConfig?.version ?? Constants.manifest?.version ?? 'unknown'
const configuredBuildNumber = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber ?? Constants.manifest?.ios?.buildNumber
    : Platform.OS === 'android'
        ? Constants.expoConfig?.android?.versionCode ?? Constants.manifest?.android?.versionCode
        : undefined

/** Installed binary version; use app config in Expo Go, whose native version is Expo Go's. */
export const APP_VERSION: string =
    (!isExpoGo ? Application.nativeApplicationVersion : null) ?? configuredVersion

/** Installed Android versionCode / iOS CFBundleVersion (EAS may manage it remotely). */
export const BUILD_NUMBER: string =
    (!isExpoGo ? Application.nativeBuildVersion : null) ??
    String(configuredBuildNumber ?? 'unknown')

/** Full version string e.g. "1.2.0 (42)" */
export const FULL_VERSION = BUILD_NUMBER === 'unknown' ? APP_VERSION : `${APP_VERSION} (${BUILD_NUMBER})`
