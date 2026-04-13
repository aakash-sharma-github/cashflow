// metro.config.js
// Safe Metro configuration for CashFlow.
//
// IMPORTANT: Keep this minimal. The previous version added aggressive
// minifier overrides (mangle: { toplevel: true }) which caused React Native
// to fail finding modules by name at runtime — contributing to the crash.
//
// Size optimisations are handled at the native level via ProGuard (app.json).
// The JS bundle is minified by Metro's default minifier during production builds.

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Block test files from being bundled (safe, no runtime impact)
config.resolver = {
  ...config.resolver,
  blockList: [
    /.*\/__tests__\/.*/,
    /.*\.test\.[jt]sx?$/,
    /.*\.spec\.[jt]sx?$/,
  ],
}

// Do NOT override transformer.minifierConfig — Metro's defaults are safe.
// Custom mangle settings can rename React Native internal references
// that are resolved via string lookups at runtime.

module.exports = config