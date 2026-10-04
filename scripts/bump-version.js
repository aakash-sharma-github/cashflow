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
const oldVersion = appJson.expo.version

const bumpType = process.argv[2] || 'patch'
const versionParts = oldVersion.split('.').map(Number)
if (versionParts.length !== 3 || versionParts.some(part => !Number.isInteger(part) || part < 0)) {
    console.error(`Invalid app.json version: ${oldVersion}. Expected MAJOR.MINOR.PATCH.`)
    process.exit(1)
}
const [major, minor, patch] = versionParts

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

const androidStringsPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')
const iosInfoPlistPath = path.join(__dirname, '..', 'ios', 'CashFlow', 'Info.plist')
const iosProjectPath = path.join(__dirname, '..', 'ios', 'CashFlow.xcodeproj', 'project.pbxproj')

const androidStrings = fs.readFileSync(androidStringsPath, 'utf8')
const runtimeVersionPattern = /(<string name="expo_runtime_version">)[^<]+(<\/string>)/
const iosVersionPattern = /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/
const iosMarketingPattern = /MARKETING_VERSION = [^;]+;/g
const hasIosNativeProject = fs.existsSync(iosInfoPlistPath) && fs.existsSync(iosProjectPath)

if (!runtimeVersionPattern.test(androidStrings)) {
    console.error('Could not find the Android runtime version field; no files were changed.')
    process.exit(1)
}

const nextAndroidStrings = androidStrings.replace(runtimeVersionPattern, `$1${newVersion}$2`)
let nextIosInfoPlist
let nextIosProject
if (hasIosNativeProject) {
    const iosInfoPlist = fs.readFileSync(iosInfoPlistPath, 'utf8')
    const iosProject = fs.readFileSync(iosProjectPath, 'utf8')
    if (!iosVersionPattern.test(iosInfoPlist) || (iosProject.match(iosMarketingPattern) || []).length === 0) {
        console.error('Could not find the iOS version fields; no files were changed.')
        process.exit(1)
    }
    nextIosInfoPlist = iosInfoPlist.replace(iosVersionPattern, `$1${newVersion}$2`)
    nextIosProject = iosProject.replace(iosMarketingPattern, `MARKETING_VERSION = ${newVersion};`)
}

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2))
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2))
fs.writeFileSync(androidStringsPath, nextAndroidStrings)
if (hasIosNativeProject) {
    fs.writeFileSync(iosInfoPlistPath, nextIosInfoPlist)
    fs.writeFileSync(iosProjectPath, nextIosProject)
}

console.log(`✅ Version bumped: ${oldVersion} → ${newVersion}`)
console.log(`   app.json, package.json, and Android runtime version updated${hasIosNativeProject ? ', along with the local iOS project' : ''}.`)
console.log('   Next: update CHANGELOG.md, review the diff, then stage and commit the release files.')
console.log(`   Then: eas build --platform android --profile production`)
