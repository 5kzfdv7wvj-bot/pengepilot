import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { google } from 'googleapis';

const bundle = process.env.ANDROID_BUNDLE_PATH || 'android/app/build/outputs/bundle/release/app-release.aab';
const packageName = process.env.ANDROID_PACKAGE_NAME || 'dk.pengepilot.app';
const track = process.env.PLAY_TRACK || 'internal';
const credentialsText = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '';

if (!credentialsText) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing.');
await access(bundle);
const credentials = JSON.parse(credentialsText);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const publisher = google.androidpublisher({ version: 'v3', auth });

const edit = await publisher.edits.insert({ packageName });
const editId = edit.data.id;
if (!editId) throw new Error('Google Play did not return an edit id.');

try {
  const uploaded = await publisher.edits.bundles.upload({
    packageName,
    editId,
    media: { mimeType: 'application/octet-stream', body: createReadStream(bundle) }
  });
  const versionCode = uploaded.data.versionCode;
  if (!versionCode) throw new Error('Google Play did not return a version code.');
  await publisher.edits.tracks.update({
    packageName,
    editId,
    track,
    requestBody: { releases: [{ name: `PengePilot ${process.env.APP_VERSION || ''} (${versionCode})`.trim(), versionCodes: [String(versionCode)], status: 'completed' }] }
  });
  await publisher.edits.commit({ packageName, editId });
  console.log(`Uploaded ${bundle} to Google Play track ${track}, versionCode ${versionCode}.`);
} catch (error) {
  try { await publisher.edits.delete({ packageName, editId }); } catch {}
  throw error;
}
