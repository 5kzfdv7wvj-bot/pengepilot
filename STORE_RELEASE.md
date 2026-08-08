# PengePilot store release

PengePilot is prepared for App Store/TestFlight and Google Play with bundle/package id `dk.pengepilot.app`.

## Automated builds

- `.github/workflows/mobile.yml` continuously proves that Android debug and iOS simulator builds compile.
- `.github/workflows/release.yml` is a manual signed release workflow.
- Release inputs are app version and numeric build number/version code.
- Android targets API 36.
- Icons and splash screens are generated from the committed `resources/logo.svg` source asset.

## GitHub Actions secrets

### Apple

Create these repository Actions secrets. Never commit the underlying files.

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_P12_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APPLE_KEYCHAIN_PASSWORD`
- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8_BASE64`

The provisioning profile must be an App Store distribution profile for `dk.pengepilot.app` and match the Apple Distribution certificate.

### Google Play

Create these repository Actions secrets:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_STORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

The Play service account must have release permissions for the PengePilot app in Play Console.

## Optional verified HTTPS app links

The app always supports the private custom URL scheme `pengepilot://` for native routing. Verified HTTPS Universal Links/App Links are optional and need a domain controlled at its root so the Apple and Android association files can live under `/.well-known/`.

If such a domain is configured later, set repository variable `PENGEPILOT_APP_DOMAIN` to the hostname only, for example `app.example.com`. The native configure script will then add iOS Associated Domains and Android auto-verified links. The required association files still have to be published on that domain.

## Privacy and account deletion

Public pages bundled in web and native builds:

- `privacy.html`
- `delete-account.html`

Account deletion invokes the authenticated Supabase Edge Function `delete-account`. The function uses the server-side Supabase service role only inside the Edge Function and removes the authenticated user's PengePilot rows before deleting the Auth user.

## Native auth and passkeys

Email/password auth continues to use the same Supabase project. Existing email confirmation and password reset continue through the HTTPS web callbacks.

Web passkeys remain available. In the native app, passkey controls are intentionally not offered until WebAuthn relying-party/domain binding has been verified on physical iOS and Android devices. This avoids shipping a login mechanism that can lock users out in a WebView.

## Release sequence

1. Add the store accounts/app records and GitHub secrets.
2. Run `Release PengePilot mobile` from GitHub Actions.
3. Keep `build_ios=true`, `build_android=true`, `upload_play=true`, and `play_track=internal` for the first release.
4. Verify TestFlight processing and Google Play Internal Testing.
5. Test login, import, deletion, deep links, file picker, keyboard, safe areas, network loss and rotation on physical devices before production review.
