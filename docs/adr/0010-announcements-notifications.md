# ADR 0010: Announcements and notifications

- Status: Accepted
- Date: 2026-10-16

## Context

M15 lets the club reach people: announcements to the whole club or a team, an in-app inbox,
push and email. ADR 0004 already fixed the constraints: push goes through the Expo push
service to APNs and FCM, payloads carry ids and no personal data, and `health` or `personal`
data is never persisted on the device.

## Decision

- **Inbox is the source of truth.** `notifications` holds one row per user and entry (kind,
  title, optional body, in-app `link`, `readAt`). Push and email are extras that point at it;
  a failed push never fails the action that caused it (`notifyUsers`, best effort).
- **Announcements** (`announcements` table, `/api/announcements`): club-wide or one team. The
  permission `announcements.write` is held club-wide by admin and secretaria and per team by
  coach and delegado, who may address only their team. Audience of a team announcement: its
  current members, their guardians and anyone with a role on that team; of a club
  announcement: every login. The author does not receive their own announcement. Readers have
  no permission to hold: they read their inbox.
- **Push**: `push_devices` stores one Expo token per row (unique token; signing in on a phone
  moves the token to that user; sign-out deletes it). The `PushSender` in `AppDeps` posts to
  Expo in chunks of 100 and deletes tokens Expo reports as `DeviceNotRegistered`. Push text is
  generic per kind ("Novo aviso do clube", "Nova convocatória") with `{notificationId, kind}`
  as data, so a lock screen never shows an announcement or a name.
- **Email** is opt-in per user (default off), sent through the existing mailer with the
  announcement text; push is opt-out (default on). `notification_preferences` has one row per
  user; no row means the defaults.
- **Hooks** so far: a call-up notifies the called-up people and their guardians (generic text,
  link to the event); a daily job (`startReminderJob`, in-process, after 08:00 Lisbon, once per
  day even across restarts) reminds 30 days, 7 days and the day of a document's expiry, from the
  `expiringDocuments` query of M14. The person and guardians always get it; admin and secretaria
  too, except for medical exams, whose existence is health tier. Bookings, incidents and
  overdue fees have no hook yet (see ROADMAP).
- **No web push.** Web users get the inbox and, if they enable it, email. Revisit if the club
  asks for it; it needs VAPID keys and a service worker.
- **Device**: `expo-notifications` registers after sign-in on iOS and Android only, never on the
  web or in a simulator, and only when the build has an EAS project id (`extra.eas.projectId`).
  Without it the inbox still works.

## Consequences

- The privacy notice (M17) must list Expo, Apple and Google as push processors.
- Inbox rows hold announcement text, which is club content, not personal data. Anything that
  would carry personal or health data must be a generic line with a link instead.
- The reminder job runs inside the API process: one instance only. Moving to several instances
  needs a lock (the once-per-day check is a read, not a lock).
