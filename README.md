# MITV Admin Panel

A single-page, Firebase-backed admin dashboard for managing the MITV app's
Live TV, Movies, Series, Pro users, and payment/update settings — no backend
server required, works from any browser (including on mobile).

## Files

- `index.html` — the full UI (login screen + dashboard)
- `app.js` — all logic (Firebase auth, database read/write, rendering)
- `firebase-rules.json` — recommended Firebase security rules

## 1. First-time setup

### a) Set your admin email in Firebase

The security rules restrict **writes** to one email address (you). Before
anything else, go to your Firebase Console → Realtime Database → and
manually add this key at the root:

```
app_config
  admin_email: "your-admin-email@gmail.com"
```

Use the **exact email** you'll sign in with on this admin panel.

### b) Apply the security rules

Firebase Console → Realtime Database → Rules tab → paste the contents of
`firebase-rules.json` → Publish.

### c) Enable Email/Password sign-in

Firebase Console → Authentication → Sign-in method → enable **Email/Password**.

### d) Open the admin panel

Just open `index.html` in a browser (double-click it, or host it anywhere —
GitHub Pages, Vercel, Firebase Hosting, or even open the local file directly).

On first login, if the account doesn't exist yet, it will be **created
automatically** — so just type your admin email + a password you choose and
tap "Sign In". Make sure this email matches what you set in `admin_email`
above, or your writes will be rejected by the security rules.

## 2. Using the panel

### Live TV / Movies
Tap the red **+** button (bottom-right) while on that tab. Fill in:
- **Title** — required
- **Stream URL** — required. Supports `.m3u8`, `.mp4`, masked/proxy links
  (like `https://fusion-rkdyiptv.vercel.app/api/.../playlist.m3u?...`), and
  YouTube video URLs
- **Source Type** — pick the matching type so the app's player knows how to
  handle the URL (M3U8/HLS, MP4, Xtream/masked, or YouTube)
- **Free for everyone** toggle — turn OFF to make it Pro-only
- **Featured** toggle — shows it in a highlighted spot (if you wire that up
  in the app later)

Tap any existing card to edit or delete it.

### Series
Series work a little differently — one entry represents the whole show,
with an editable list of episodes inside. Add a season/episode number,
title, and stream URL per episode, then Save. The app reads
`/series_index` for the "Series" row and `/series/{id}/episodes` for the
episode list when a user opens a show.

### Users & Pro
Every user who has ever opened the app appears here automatically. Tap
**Manage** next to any user to:
- Toggle Pro on/off
- Set an expiry date (or tap **+1 Month** to quickly extend from today or
  from their current expiry, whichever is later)

When you save, `proExpiryNotified` is reset — so if their Pro later
expires, the app will show them a fresh "your Pro has expired" banner.

### Settings
- **JazzCash Payment Details** — the number, WhatsApp number, and price
  shown on the app's Buy Pro screen. Update this any time (e.g. if you
  change your JazzCash number) and it reflects in the app instantly.
- **Force Update** — flip this on with a version name, message, and
  download link to prompt users to update. (Requires the app side to read
  `/app_config/update` — already wired into the Android app's
  `MediaRepository.observeUpdateFlag()`.)

## 3. Data structure reference

```
live_channels/{id}          → title, streamUrl, sourceType, logoUrl, groupTitle,
                               isFree, isFeatured, language, year, description
movies/{id}                 → title, streamUrl, sourceType, posterUrl, groupTitle,
                               isFree, isFeatured, language, year, description
series_index/{seriesId}     → title, posterUrl, isFree, episodeCount, year,
                               language, description  (the "show card")
series/{seriesId}/episodes/{epId}
                             → title, streamUrl, seasonNumber, episodeNumber,
                               seriesId, isFree, posterUrl
users/{uid}/profile         → uid, email, isPro, proExpiresAt, proActivatedAt,
                               proExpiryNotified, displayName
app_config/payment          → jazzCashNumber, whatsappNumber, proPrice
app_config/update           → forceUpdate, latestVersionName, updateMessage,
                               downloadUrl, latestVersionCode
app_config/admin_email      → (set manually once — see step 1a)
```

## 4. Hosting options

This is a static site — three easy free options:
- **Firebase Hosting** (`firebase deploy` if you have the CLI set up)
- **Vercel** — drag-and-drop the folder onto vercel.com, or connect a GitHub repo
- **GitHub Pages** — push to a repo, enable Pages in repo settings

Or just keep it as a local file and open it in a browser whenever you need
to manage content — it works offline for the UI shell, and connects to
Firebase whenever you have internet.
