#!/usr/bin/env node
// scripts/bump-version.js
// Bumps version in app.json (single source of truth).
// Usage:
//   node scripts/bump-version.js patch  → 1.0.0 → 1.0.1
//   node scripts/bump-version.js minor  → 1.0.0 → 1.1.0
//   node scripts/bump-version.js major  → 1.0.0 → 2.0.0
//
// NOTE: versionCode (Android) is auto-incremented by EAS on each production build.
// You only need to bump the semver version when you want to signal a new release.

const fs = require('fs')
const path = require('path')

const appJsonPath = path.join(__dirname, '..', 'app.json')
const pkgJsonPath = path.join(__dirname, '..', 'package.json')

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))

const bumpType = process.argv[2] || 'patch'
const [major, minor, patch] = appJson.expo.version.split('.').map(Number)

let newVersion
switch (bumpType) {
    case 'major': newVersion = `${major + 1}.0.0`; break
    case 'minor': newVersion = `${major}.${minor + 1}.0`; break
    case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break
    default:
        console.error(`Unknown bump type: ${bumpType}. Use: patch | minor | major`)
        process.exit(1)
}

appJson.expo.version = newVersion
pkgJson.version = newVersion

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2))
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2))

console.log(`✅ Version bumped: ${appJson.expo.version.split('.').slice(0, 3).join('.')} → ${newVersion}`)
console.log(`   app.json and package.json updated.`)
console.log(`   Next: git commit -am "chore: bump version to ${newVersion}"`)
console.log(`   Then: eas build --platform android --profile production`)