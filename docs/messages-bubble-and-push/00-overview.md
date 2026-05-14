# Chat bubble + push notifications for POS messages — Overview

> Two related features that turn the existing Messages page into something that doesn't require the user to actively check it:
>
> 1. **Floating chat bubble** — a Messenger-style bubble that's always visible (or visible on every non-Messages page), shows an unread badge, and opens a compact chat overlay when tapped — no full-page navigation needed.
> 2. **Push notifications** — proper Android (and eventually iOS) notifications when a new Facebook Page message arrives, so the staff sees it on the lockscreen instead of relying on the in-app toast that only fires while the app is foregrounded.

---

## Why these two together

They share most of their plumbing:
- An **unread store** that tracks which incoming messages haven't been acknowledged yet
- A **mark-as-read** signal that fires when the user reads a thread
- Server-side awareness of unread state so notifications don't keep firing for a message the user already read

If we build the bubble alone without the unread store, the badge is fake. If we build push alone without the mark-as-read flow, customers get "you've got a new message" pings for messages they already replied to.

---

## User flow (target)

1. Customer messages the Facebook Page → Graph poller (~20 s) writes it to `messenger_messages`
2. **Push notification** fires on every device that has the APK installed and notifications enabled
3. Tapping the notification → opens the app directly to that thread
4. Anywhere else in the app, the **chat bubble** in the bottom-right shows an unread count
5. Tapping the bubble → slides in a compact 360 × 480 chat overlay rendered on top of the current page (no route change)
6. Reading a thread or sending a reply marks those messages as read; bubble count + notification clear

---

## Decisions to confirm before building

### Q1. Bubble placement
- **A.** Fixed bottom-right corner (Messenger style) — ~56 px circle, anchored, draggable on mobile
- **B.** Top header bar — fixed position next to the global hamburger; no drag, smaller footprint

*Recommendation: A.* More discoverable; the badge is more visible; matches the user's intuition from FB Messenger.

### Q2. Bubble visibility
- **A.** Always visible on every page except the Messages page itself
- **B.** Only visible to admins (treat as a moderation tool)
- **C.** Toggleable in Settings

*Recommendation: A.* Cashiers handle customer messages too in practice; making it admin-only adds friction without security upside.

### Q3. Compact overlay vs full Messages page
Tapping the bubble:
- **A.** Slides in a **compact 360 × 480 overlay** showing the thread list. Tap a thread → opens that thread in the same overlay. Full Messages page remains accessible via the sidebar.
- **B.** Just navigates to `/messages` (no overlay). The bubble is purely a notification badge.

*Recommendation: A.* The whole point is "answer without leaving what you're doing." (B) makes the bubble basically a glorified notification icon.

### Q4. Push notification provider
- **A.** **Firebase Cloud Messaging (FCM)** — industry standard, free, well-supported by Expo. Needs an FCM project + a server-side key.
- **B.** **OneSignal** — free up to a generous limit, simpler setup, less native code on the APK side
- **C.** **Local notifications only** — fire when the WebView is alive and detects a new message. **No background delivery.** Cheap but pointless if the user has the app closed.

*Recommendation: A (FCM).* Real background push, no third-party dependency for the actual delivery, free for our scale. Setup is ~1 hour of Firebase console + ~50 lines of native config.

### Q5. Notification permission UX
- **A.** Ask for notification permission **on first launch** of the new APK (system prompt as soon as the app opens)
- **B.** Ask **the first time** the user goes to the Messages page or taps the chat bubble
- **C.** Add a Settings toggle and only ask when they enable it

*Recommendation: B.* Permission prompts on cold-launch get denied at ~30 % rates. Asking in context (when the user is showing interest in messages) lifts the grant rate.

### Q6. Notification grouping / deduplication
- One message per notification, no grouping
- Group by sender (multiple messages from the same customer = one expandable notification)
- Group all unread into a single "You have 5 new messages" notification

*Recommendation: Group by sender.* Android's stock pattern — each group expands to show the individual messages.

### Q7. What does tapping a notification do?
- **A.** Opens the app, navigates to that thread, marks the message as read
- **B.** Opens the app to the Messages page (thread list)
- **C.** Opens the app to wherever it was last (just brings to foreground)

*Recommendation: A.* Standard chat-app behavior.

---

## Architecture summary (preview — fleshed out in the step files)

```
┌─────────────────────────┐    ┌───────────────────────────────┐
│  Facebook Graph API     │    │  Kali server                  │
│  /me/conversations      │←───│  pos-sync-api                 │
└─────────────────────────┘    │   • Graph poller (every 20s)  │
                                │   • DETECT new messages       │
                                │   • POST to FCM Send API ────┼──→ FCM ──→ Android devices
                                │   • Track unread state        │
                                │   • Accept "mark read" syncs  │
                                └───────────────────────────────┘
                                              │
              ┌───────────────────────────────┴────────────────────────┐
              │                                                        │
              ▼                                                        ▼
    ┌─────────────────────────┐                     ┌────────────────────────────────┐
    │  Mobile WebView APK     │                     │  Web app (3ks.afkcube.com/app)│
    │   • Receives FCM push   │                     │   • Receives Web Push (later)  │
    │   • Notification → deep │                     │   • Chat bubble component      │
    │     link to thread      │                     │   • Compact overlay            │
    │   • Chat bubble         │                     │   • Unread badge               │
    └─────────────────────────┘                     └────────────────────────────────┘
```

---

## File-by-file change list (high-level)

| File | Why |
|---|---|
| `packages/core/src/schema/messenger-reads.ts` (NEW) | Track which (psid, last_read_at) the user has acknowledged |
| `packages/desktop/src/main/database.ts` | Add `messenger_reads` table |
| `api/server.js` + new `api/messages-push.js` | New endpoints: `POST /api/messenger/mark-read`, `POST /api/messenger/devices/register`, `DELETE /api/messenger/devices/:id` |
| `api/messenger.js` (modify) | After Graph poller inserts new `in` messages, fan-out push notifications to registered devices |
| `packages/desktop/src/renderer/lib/messenger-api.ts` | Add `markRead`, `registerDevice`, `unreadCount` helpers |
| `packages/desktop/src/renderer/components/ui/ChatBubble.tsx` (NEW) | Floating bubble + compact overlay |
| `packages/desktop/src/renderer/app/App.tsx` | Mount `<ChatBubble>` in the ProtectedLayout |
| `packages/desktop/src/renderer/app/pages/MessagesPage.tsx` | Call `markRead(psid)` when a thread becomes visible |
| `packages/mobile/index.js` | FCM registration: get device token, send to server on app start |
| `packages/mobile/package.json` + native bits | Add `@react-native-firebase/app` + `/messaging` |
| `packages/mobile/google-services.json` (NEW) | FCM project config |
| `docs/messages-bubble-and-push/01-*.md` … `06-*.md` | Step files |

Estimated effort: **~6–10 hours**, split across:
- ~1 h: FCM project setup + native deps
- ~2 h: server-side push fan-out + endpoints
- ~2 h: ChatBubble React component
- ~1 h: unread tracking + mark-read plumbing
- ~1 h: deep-link routing from notification tap
- ~1–2 h: testing on real Android hardware

---

## Sequencing (in order)

1. [01-unread-tracking.md](01-unread-tracking.md) — `messenger_reads` table + mark-read endpoints
2. [02-chat-bubble.md](02-chat-bubble.md) — React component: bubble + overlay + unread badge
3. [03-fcm-setup.md](03-fcm-setup.md) — Firebase project, `google-services.json`, RN Firebase deps
4. [04-server-push.md](04-server-push.md) — Server fans out FCM messages on new-message detection
5. [05-device-registration.md](05-device-registration.md) — APK registers its FCM token on app start
6. [06-deep-link-and-test.md](06-deep-link-and-test.md) — Notification tap → open thread; manual + real-device test plan

---

## Open question I'll flag early

**Permission to send to FCM**: requires you to create a Firebase project under a Google account and generate a server-side credential. I can plan around this and tell you exactly what files to drop where, but I can't create the project for you. Once it exists I can wire everything up end-to-end. Want me to walk you through the Firebase console setup as part of step 03, or do you already have an FCM project from a prior app?

---

## Risks / non-obvious things

- **Android 13+ requires runtime POST_NOTIFICATIONS permission.** Easy to handle but easy to miss.
- **iOS push** is a different beast (APNs cert via Apple Developer Program). Not part of this scope; the plan keeps the abstraction so iOS slots in later without rewriting the bubble/UI work.
- **Web push** (notifications when the user has 3ks.afkcube.com/app open in Chrome on a desktop) is possible via the existing service worker but a different API than FCM. Out of scope for v1; we'll cover it in a follow-up.
- **Bubble UX on tiny screens**: a 56 px bubble plus a 360 × 480 overlay on a 360-wide Android viewport means the overlay should be near-full-screen. The component needs to adapt; the plan covers it.
- **Notification storm protection**: if Graph delivers 10 backlogged messages in one poll, we should send 1 grouped notification per sender, not 10. Step 04 covers throttling + grouping.
- **Battery / data on the APK**: FCM is free of either concern — Google handles the persistent socket — but we should NOT also keep the existing JS toast poller running in the foreground (it'd duplicate notifications + waste battery). Step 04 covers replacing it.
