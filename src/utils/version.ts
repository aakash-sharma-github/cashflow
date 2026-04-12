// src/utils/version.ts
// Single source of truth for the app version at runtime.
// Reads from expo-constants which pulls from app.json at build time.
// This means you never hardcode version strings in your UI.

import Constants from 'expo-constants'

/** Semantic version string e.g. "1.2.0" */
export const APP_VERSION: string =
    Constants.expoConfig?.version ??
    Constants.manifest?.version ??
    '1.0.0'

/** Android versionCode / iOS CFBundleVersion — the build number */
export const BUILD_NUMBER: string =
    String(
        Constants.expoConfig?.android?.versionCode ??
        Constants.manifest?.android?.versionCode ??
        '1'
    )

/** Full version string e.g. "1.2.0 (42)" */
export const FULL_VERSION = `${APP_VERSION} (${BUILD_NUMBER})`