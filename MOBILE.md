# PengePilot mobile

PengePilot kan nu bygges som native iOS- og Android-app med Capacitor. Webappen pakkes lokalt i appen; mobilappen peger ikke på GitHub Pages som `server.url`.

## App-identitet

- Navn: `PengePilot`
- Bundle/package ID: `dk.pengepilot.app`
- Web bundle: `www/`
- Native runtime: Capacitor 8

## Lokal udvikling

Kræver Node.js 22+.

```bash
npm install
npm run mobile:prepare
npx cap add android
npx cap add ios
```

Efter ændringer i HTML/CSS/JS:

```bash
npm run mobile:sync
```

Android åbnes med `npx cap open android`. iOS åbnes med `npx cap open ios` på macOS med Xcode.

## GitHub Actions

Workflowet `.github/workflows/mobile.yml` bygger automatisk efter relevante ændringer på `main` og kan også startes manuelt.

Artifacts:

- `PengePilot-Android-debug`: installérbar debug-APK til Android-test.
- `PengePilot-iOS-simulator`: usigneret simulator-build til iOS-verifikation.

## Store release

CI bygger bevidst ikke signerede store-pakker endnu. En offentlig release kræver:

### Apple

- Apple Developer Program-medlemskab.
- App-ID/certifikater/provisioning i Apple Developer/App Store Connect.
- Signeret archive/IPA og App Store metadata/privacy-oplysninger.

### Google Play

- Play Console developer account og identitetsverifikation.
- Release-keystore og signeret Android App Bundle (AAB).
- Store listing, Data safety og øvrige Play Console-erklæringer.

Signing credentials skal gemmes som GitHub Actions secrets og må aldrig committes i repository.

## Auth

Email/password fungerer mod samme Supabase backend. Email-bekræftelse og password-reset bruger foreløbig den eksisterende HTTPS callback på GitHub Pages. Passkeys skal verificeres på rigtige iOS- og Android-enheder før store-release, fordi WebAuthn-adfærd kan variere mellem browser og native WebView.

## Næste release-trin

Når Apple Developer- og Play Console-konti er oprettet, udvides workflowet med signeret iOS archive/TestFlight og signeret Android AAB/Internal Testing.
