<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Jalali Calendar for Nextcloud

**تقویم جلالی برای نکست‌کلاد**

Shows the calendars you already have in Nextcloud on a Persian (Jalali/Shamsi)
month grid — correct Shamsi month and weekday names, a Saturday-first week,
Persian numerals and an RTL layout.

Your data is never converted or copied. The app reads the same CalDAV
calendars as the official Calendar app, so everything stays interoperable with
your phone, Thunderbird, Outlook and any other CalDAV client. **Jalali is purely
a display layer; events are always stored as Gregorian/UTC.**

## Status

**v0.1.0 — read-only.** This is the MVP described in `JALALI_CALENDAR_PLAN.md`:

- [x] Jalali month view of all your existing calendars
- [x] Persian month/weekday names, Saturday-first week, Persian numerals
- [x] Per-calendar colours and show/hide toggles (remembered per browser)
- [x] Recurring events expanded within the visible window, including
      `EXDATE` and modified/detached occurrences
- [x] Day panel with event details (time, location, calendar, description)
- [x] RTL layout, Farsi translation
- [x] Warns when the device timezone differs from your calendar timezone
- [ ] Creating, editing and deleting events — planned for v0.2
- [ ] Week and day views — planned for v0.3
- [ ] Iranian holidays overlay — planned for v0.4

Events are created and edited in the official Calendar app; this app coexists
with it rather than replacing it.

### Known limitations

Event times are rendered in the **browser's** timezone rather than the timezone
configured for your calendars. When the two differ the app says so, but the
displayed clock times will not match the Calendar app until v0.2 handles
timezones properly.

## Requirements

- Nextcloud **31 or 32** — the UI is built on `@nextcloud/vue` 9, which
  requires Nextcloud 31+
- PHP 8.1+
- Node 20+ and npm (to build from source)

## Install from source

```bash
git clone https://github.com/naserfathi/jalali_calendar.git
cd jalali_calendar
npm ci
npm run build
```

Then place (or symlink) the directory into your server's app folder and enable it:

```bash
ln -s "$PWD" /path/to/nextcloud/custom_apps/jalali_calendar
occ app:enable jalali_calendar
```

The directory name **must** be `jalali_calendar` — Nextcloud resolves the app
namespace from it.

While working on the frontend, `npm run watch` rebuilds on change; reload the
browser to pick the bundle up.

## Tests

```bash
npm run test
```

The suite covers the Jalali conversion helpers (leap years, month boundaries,
Nowruz, grid construction) and the iCalendar parsing layer (recurrence
expansion, `EXDATE`, overridden occurrences, all-day `DTEND` exclusivity).

Dates are built from *local* calendar fields, so the tests are run under
several timezones in CI (`UTC`, `Asia/Tehran`, `America/New_York`). Run them
the same way locally if you touch date handling:

```bash
TZ=America/New_York npm run test
```

## How it works

```
Browser (Vue 3 SPA)
  ├─ src/utils/jalali.js   Gregorian ↔ Jalali, month grid construction
  ├─ src/utils/events.js   ical.js parsing + recurrence expansion
  ├─ src/utils/caldav.js   @nextcloud/cdav-library → /remote.php/dav
  └─ src/store/            shared reactive state
        ▲
        │ initial state (timezone, deep-linked month)
PHP backend (thin: Application, PageController, one route)
```

The backend serves the page shell and nothing else — all calendar traffic goes
straight from the browser to CalDAV, exactly as the official Calendar app does.

Rendering a Jalali month means fetching the *Gregorian* window that covers it.
`buildMonthGrid()` always returns six full weeks starting on a Saturday, and
its `rangeStart`/`rangeEnd` are handed to a CalDAV time-range `REPORT`.

### Deep links

`/apps/jalali_calendar/1405/5` opens Mordad 1405 directly.

## Publishing to the app store

0. Add at least one screenshot. `info.xml` points at
   `screenshots/month-view.png` in this repo's `main` branch; the URL must
   resolve before the store will accept the release.
1. Request a certificate for the app id `jalali_calendar` at
   [nextcloud/app-certificate-requests](https://github.com/nextcloud/app-certificate-requests).
2. Put the private key at `~/.nextcloud/certificates/jalali_calendar.key`.
3. `make appstore` — builds `build/artifacts/jalali_calendar.tar.gz` and, when
   the key is present, writes the matching `.sig`.
4. Tag and push (`git tag v0.1.0 && git push --tags`); the release workflow
   builds, signs and attaches both files. It needs the key in the
   `APP_SIGNING_KEY` repository secret.
5. Register the app at [apps.nextcloud.com](https://apps.nextcloud.com) and
   submit the release download URL plus the signature.

`info.xml` is validated against the official schema on every push.

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).
