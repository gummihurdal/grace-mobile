# Publishing Grace to the App Store and Google Play

This guide covers everything that must happen **outside this repo** before the
GitHub Actions workflows can build and upload your app. The workflows themselves
(`build-ios.yml`, `build-android.yml`) are ready — they just need credentials
and an app shell on each store.

Bundle ID: **`day.graceforevery.app`**
Apple Team ID: **`XT323ZDS6N`** (already wired into `build-ios.yml`)

---

## 1. Apple App Store

### Prerequisites
- [ ] Apple Developer Program membership ($99/yr) — https://developer.apple.com/programs/enroll/
- [ ] App registered in App Store Connect with bundle ID `day.graceforevery.app`
  - https://appstoreconnect.apple.com → My Apps → "+" → New App
  - Platform: iOS, Name: Grace, Primary Language: English, SKU: `grace-ios`
- [ ] App Store Connect API key created (Users and Access → Integrations → App Store Connect API)
  - Role: **Admin** (App Manager not enough for Fastlane signing flow)
  - Download the `.p8` file — you only get one chance

### GitHub Secrets to set on `gummihurdal/grace-mobile`
Settings → Secrets and variables → Actions → New repository secret

| Secret | Where to find it |
|---|---|
| `APP_STORE_CONNECT_KEY_ID` | Shown next to the API key (e.g. `9ABC123XYZ`) |
| `APP_STORE_CONNECT_ISSUER_ID` | Shown at the top of the API Keys page (UUID format) |
| `APP_STORE_CONNECT_KEY_P8` | Full contents of the `.p8` file (paste including the `-----BEGIN PRIVATE KEY-----` lines) |

### App Store listing assets you'll need to upload manually
- App icon: 1024×1024 PNG, no alpha, no rounded corners (Apple rounds it). The build will use the icon set generated from `assets/icon-only.png`; the marketing icon you upload to App Store Connect uses the same source.
- Screenshots: 6.7" iPhone (1290×2796) — minimum 3, max 10. Easiest: take from a TestFlight install on iPhone 15 Pro Max simulator.
- App description, keywords, support URL (`https://graceforevery.day`), privacy policy URL (`https://graceforevery.day/privacy.html`).
- Privacy nutrition labels (Data Safety form). What Grace collects:
  - **Identifiers**: IP address (via `ipapi.co` → `visitor_logs` table) — used for analytics only, not linked to identity.
  - **Usage data**: Page views via `visitor_logs`.
  - Mark as: "Not linked to user identity", "Not used for tracking".

### First TestFlight build
1. Set the three secrets above.
2. GitHub → Actions → "Build & Upload iOS App" → Run workflow → main branch.
3. Wait ~15–25 min. Build uploads to TestFlight automatically.
4. In App Store Connect, add your Apple ID as an internal tester. Install via TestFlight on your iPhone.
5. Once happy, submit for review from App Store Connect.

### Apple review risk — Guideline 4.2 ("Minimum Functionality")
The current architecture is now **bundled HTML + Capacitor native plugins**, not a
pure webview wrapper, so the rejection risk is much lower than the previous
`server.url` setup. Visible native features for the reviewer:
- Native Share sheet on the daily devotion (`Share` button)
- Local-storage favorites via Capacitor Preferences (`Save` button)
- In-app browser (Safari View Controller) for external links
- Native splash screen and status bar
- Hardware back button handling (Android)

If still rejected, the next step is **adding push notifications** for daily
devotion delivery — which would require an APNs Auth Key and a server-side
trigger (Supabase scheduled function calling APNs). Doable in a follow-up.

---

## 2. Google Play Store

### Prerequisites
- [ ] Google Play Console account ($25 one-time) — https://play.google.com/console/signup
- [ ] App created in Play Console with package name `day.graceforevery.app`
  - All apps → Create app → Name: Grace, Default language: English, App or game: App, Free.
- [ ] Generate release keystore on your machine (keep the `.jks` file safe — losing it means losing the ability to update the app forever):
  ```bash
  keytool -genkey -v \
    -keystore release.jks \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -alias grace
  ```
  Use a strong password and remember it.
- [ ] Base64-encode it for the GitHub secret:
  ```bash
  base64 -i release.jks | tr -d '\n' > release.jks.base64
  ```
- [ ] Service account for Play Console API:
  - https://console.cloud.google.com → New project → APIs & Services → Enable "Google Play Android Developer API"
  - IAM & Admin → Service Accounts → Create → JSON key → download
  - In Play Console → Setup → API access → Link the project → Grant access to the service account with "Release manager" role.

### GitHub Secrets to set on `gummihurdal/grace-mobile`

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Contents of `release.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password from `keytool` |
| `ANDROID_KEY_ALIAS` | `grace` |
| `ANDROID_KEY_PASSWORD` | Key password (usually same as keystore password) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full contents of the service account JSON file |

### Play Console listing assets
- App icon: 512×512 PNG (auto-generated into the AAB from `assets/icon-only.png`).
- Feature graphic: 1024×500 PNG (manual upload — needs creating).
- Phone screenshots: 1080×1920 minimum, 8 max. Easiest: Pixel 7 emulator → take screenshots.
- Short description (80 chars), full description (4000 chars).
- Privacy policy URL: `https://graceforevery.day/privacy.html`.
- Data Safety form: same disclosures as Apple (IP for analytics, no tracking).

### First internal test build
1. Set the five secrets above.
2. Make a first manual upload via the Play Console (required — the API can't create the app's first release). Build locally:
   ```bash
   git clone git@github.com:gummihurdal/grace-mobile.git
   cd grace-mobile && npm install
   npx cap add android
   npx capacitor-assets generate --android
   npx cap sync android
   cd android
   ./gradlew bundleRelease  # without signing for the very first upload
   ```
   Upload the resulting `app/build/outputs/bundle/release/app-release.aab` to **Internal testing → Create new release** in the Play Console.
3. After that initial upload, the GitHub Actions workflow can take over: Actions → "Build & Upload Android App" → Run workflow → track: `internal`.
4. Promote internal → closed (alpha/beta) → production from the Play Console.

---

## 3. Cleanups before submission

### Supabase — delete the Sabbath topic row
The HTML pages still defensively filter `the-sabbath` on the client side. Clean
the database to make it real:

```sql
-- Run in the Supabase SQL editor for project mjphpctvuxmbjhmcscoj
DELETE FROM lessons WHERE topic_slug = 'the-sabbath';
DELETE FROM topics  WHERE slug = 'the-sabbath';
```

### Privacy policy
`www/privacy.html` is bundled with the app and must be available at
`https://graceforevery.day/privacy.html` on the live site (it already is). Both
stores require this URL in the listing.

### Visitor analytics in the mobile app
The bundled pages call `ipapi.co` and write to `visitor_logs` in Supabase. Apple
requires this to be disclosed in the privacy nutrition label as **Identifiers →
IP address → Analytics → Not linked to identity**. If you'd rather skip this in
the app to simplify the disclosure, strip the `fetch('https://ipapi.co/...')`
blocks from the bundled HTML pages before publishing.

---

## 4. What's still in your court

- Pay the two store fees ($99 + $25)
- Create accounts in App Store Connect and Play Console
- Generate and **safely store** the Android keystore
- Set the eight GitHub secrets (3 iOS + 5 Android)
- Create the listings (icons, screenshots, descriptions) — all manual via web
- Submit for review from the store consoles

Everything else — building, signing, uploading to TestFlight / Play internal
track — is fully automated by the workflows in `.github/workflows/`.
