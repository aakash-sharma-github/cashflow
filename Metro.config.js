// metro.config.js — Production Metro configuration
// Safe and minimal — no aggressive overrides that cause runtime crashes
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Block test files from the bundle (zero runtime impact)
config.resolver = {
  ...config.resolver,
  blockList: [
    /.*\/__tests__\/.*/,
    /.*\.test\.[jt]sx?$/,
    /.*\.spec\.[jt]sx?$/,
  ],
}

// Enable inline requires for faster app startup.
// Modules only load when first used instead of all at boot.
// This is safe and recommended by Meta for production React Native apps.
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,          // ← defers module loading to first use
    },
  }),
}

module.exports = config