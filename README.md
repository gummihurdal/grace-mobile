# Grace for Every Day — Mobile App

iOS + Android mobile build of [graceforevery.day](https://graceforevery.day),
wrapped with [Capacitor](https://capacitorjs.com/).

- **Bundle ID**: `day.graceforevery.app`
- **Architecture**: bundled HTML/CSS/JS in `www/` (Supabase calls remain
  client-side, so devotional content stays fresh without an app update),
  with native Capacitor plugins for share, browser, preferences, splash,
  and status bar.

## Repo layout

| Path | What it is |
|---|---|
| `www/` | Bundled web app — copied from the live site. This is what runs in the WebView. |
| `www/native.js` | Native bridge — wires Capacitor plugins (share, browser, preferences, hardware back) to the bundled pages. Safe no-op in regular browsers. |
| `assets/` | Source images for `@capacitor/assets` to generate icons and splash for both platforms. |
| `capacitor.config.json` | App ID, plugin config, no `server.url` (loads bundled content). |
| `.github/workflows/build-ios.yml` | Builds iOS, signs, uploads to TestFlight via Fastlane. |
| `.github/workflows/build-android.yml` | Builds Android AAB, signs, uploads to Play internal track via Fastlane. |
| `PUBLISHING.md` | Full step-by-step for store accounts, secrets, listings, and first submission. |

## Local dev

```bash
npm install
npm run ios:add        # adds ios/ folder
npm run android:add    # adds android/ folder
npm run assets         # generates all icon and splash sizes from assets/
npm run sync           # syncs www/ + plugins into native projects
npx cap open ios       # opens Xcode
npx cap open android   # opens Android Studio
```

## Updating bundled content

When the live site (`gummihurdal/devotion`) gets new pages or styling that
should ship in the app, copy them over and re-inject the native bridge:

```bash
# from the parent dir of both repos
cp -rf devotion/www/*.html devotion/www/manifest.json devotion/www/*.png \
       grace-mobile/www/
cd grace-mobile/www && for f in *.html; do
  grep -q "native.js" "$f" || sed -i 's|</head>|<script src="native.js" defer></script></head>|' "$f"
done
```

## Publishing

See [`PUBLISHING.md`](./PUBLISHING.md) for the full step-by-step.
