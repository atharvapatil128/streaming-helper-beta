---
version: 1
slug: "src-app-app-tsx"
primary_target: "src/app/App.tsx"
related_targets: ["src/app/components/FriendSidebar.tsx","src/app/components/SuggestionCard.tsx","src/app/components/FilterBar.tsx","src/app/components/SearchBar.tsx","src/app/components/ComfortList.tsx","src/styles/dashboard.css"]
---

# Streaming Helper authenticated dashboard

- Scope: authenticated companion dashboard at `/app`, including the friend
  rail, recommendations workspace, Comfort List, and responsive navigation.
- Visitor mode: Operate.
- Audience: signed-in users returning to review, filter, send, dismiss, and act
  on recommendations from trusted friends, or maintain familiar Comfort Picks.
- Job: make the next useful action obvious while keeping sender context and
  account utilities quickly available.
- Proof/content: real recommendation and friend data already returned by the
  application; no invented analytics or viewing history.
- Constraints: preserve all existing data contracts, modals, routes, account
  behavior, official links, privacy boundaries, and the violet/cornflower
  identity. Meet WCAG 2.2 AA and support 320px through wide desktop.
- Direction: Streaming Control Desk — a compact matte graphite workspace with
  restrained lavender state color, a stable contextual friend rail on desktop,
  and a focused single-column mobile composition.
- Memorable moment: the selected friend, Received/Sent state, filters, and title
  results read as one continuous task rather than disconnected cards.
- Unresolved: the Settings surface can inherit this system in a later dedicated
  pass; this branch does not change backend behavior.
