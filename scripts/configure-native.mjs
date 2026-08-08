import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = String(process.env.APP_VERSION || '1.0.0').replace(/[^0-9.]/g, '') || '1.0.0';
const build = Math.max(1, Number.parseInt(process.env.BUILD_NUMBER || '1', 10) || 1);
const domain = String(process.env.PENGEPILOT_APP_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function configureAndroid() {
  const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  const variablesPath = path.join(root, 'android/variables.gradle');
  const gradlePath = path.join(root, 'android/app/build.gradle');
  if (!(await exists(manifestPath))) return;

  let manifest = await readFile(manifestPath, 'utf8');
  manifest = manifest.replace(/android:allowBackup="true"/g, 'android:allowBackup="false"');
  if (!/android:usesCleartextTraffic=/.test(manifest)) manifest = manifest.replace('<application ', '<application android:usesCleartextTraffic="false" ');
  if (!/android:scheme="pengepilot"/.test(manifest)) {
    const filter = `\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="pengepilot" />\n            </intent-filter>`;
    manifest = manifest.replace(/(\s*<\/activity>)/, `${filter}$1`);
  }
  if (domain && !manifest.includes(`android:host="${domain}"`)) {
    const filter = `\n            <intent-filter android:autoVerify="true">\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="https" android:host="${domain}" />\n            </intent-filter>`;
    manifest = manifest.replace(/(\s*<\/activity>)/, `${filter}$1`);
  }
  await writeFile(manifestPath, manifest);

  if (await exists(variablesPath)) {
    let variables = await readFile(variablesPath, 'utf8');
    variables = variables.replace(/compileSdkVersion\s*=\s*\d+/g, 'compileSdkVersion = 36');
    variables = variables.replace(/targetSdkVersion\s*=\s*\d+/g, 'targetSdkVersion = 36');
    await writeFile(variablesPath, variables);
  }
  if (await exists(gradlePath)) {
    let gradle = await readFile(gradlePath, 'utf8');
    gradle = gradle.replace(/versionCode\s+\d+/g, `versionCode ${build}`);
    gradle = gradle.replace(/versionName\s+"[^"]+"/g, `versionName "${version}"`);
    await writeFile(gradlePath, gradle);
  }
  console.log(`Configured Android: version ${version} (${build}), target API 36, deep link pengepilot://`);
}

function plistValue(key, value) {
  return `\n\t<key>${key}</key>\n\t${value}`;
}

async function configureIos() {
  const plistPath = path.join(root, 'ios/App/App/Info.plist');
  const projectPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  const entitlementsPath = path.join(root, 'ios/App/App/App.entitlements');
  if (!(await exists(plistPath))) return;

  let plist = await readFile(plistPath, 'utf8');
  if (!plist.includes('<key>CFBundleURLTypes</key>')) {
    const block = plistValue('CFBundleURLTypes', `<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>dk.pengepilot.app</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>pengepilot</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`);
    plist = plist.replace(/\n<\/dict>\s*<\/plist>/, `${block}\n</dict>\n</plist>`);
  }
  if (!plist.includes('<key>ITSAppUsesNonExemptEncryption</key>')) {
    plist = plist.replace(/\n<\/dict>\s*<\/plist>/, `${plistValue('ITSAppUsesNonExemptEncryption', '<false/>')}\n</dict>\n</plist>`);
  }
  await writeFile(plistPath, plist);

  if (await exists(projectPath)) {
    let project = await readFile(projectPath, 'utf8');
    project = project.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
    project = project.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
    if (domain) {
      const codeSignLine = 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;';
      if (!project.includes(codeSignLine)) project = project.replace(/(PRODUCT_BUNDLE_IDENTIFIER = dk\.pengepilot\.app;)/g, `${codeSignLine}\n\t\t\t\t$1`);
    }
    await writeFile(projectPath, project);
  }

  if (domain) {
    const entitlements = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>com.apple.developer.associated-domains</key>\n  <array>\n    <string>applinks:${domain}</string>\n  </array>\n</dict>\n</plist>\n`;
    await writeFile(entitlementsPath, entitlements);
  }
  console.log(`Configured iOS: version ${version} (${build}), deep link pengepilot://${domain ? `, associated domain ${domain}` : ''}`);
}

await Promise.all([configureAndroid(), configureIos()]);
