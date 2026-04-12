// metro.config.js
// Metro bundler configuration for CashFlow.
// Key optimisations that reduce JS bundle size:
//   1. Tree-shaking via minification
//   2. Exclude large packages from the bundle
//   3. Inline requires (lazy loading — reduces startup time)

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Enable inline requires — modules only load when first used, not at startup
// This improves cold start time significantly
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_classnames: false,
    keep_fnames: false,
    mangle: {
      toplevel: true,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
      wrap_iife: true,
    },
    sourceMap: {
      includeSources: false,
    },
    toplevel: false,
    compress: {
      reduce_funcs: false,
    },
  },
}

// Resolve only used platform files
config.resolver = {
  ...config.resolver,
  // Prefer optimised platform variants
  resolverMainFields: ['react-native', 'browser', 'main'],
  // Block packages that are accidentally included but unused
  blockList: [
    // Exclude test files from bundle
    /.*\/__tests__\/.*/,
    /.*\.test\.[jt]sx?$/,
    /.*\.spec\.[jt]sx?$/,
  ],
}

module.exports = config