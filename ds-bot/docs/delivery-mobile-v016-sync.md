# Delivery: upstream v0.1.6 sync, mobile reapply, and the settings-dialog layer fix

## Goal

Two requests:

1. Pull the upstream update (the user said "上游更新了，你记得拉取更新").
2. Fix the settings dialog opened from the whale menu in the left drawer: it was fully
   covered by the drawer ("左滑出来的左侧边栏点击左下角小鲸鱼出来的设置弹窗全在侧边栏后面").

## Findings

### The fork and upstream have no common ancestor

`git merge-base origin/main upstream/main` is empty. The two histories were rewritten
apart: this fork's initial commit is `b03a341`, upstream's is `d1786e3`. `git merge
--ff-only upstream/main` fails with `fatal: refusing to merge unrelated histories`.

So the sync cannot be a merge. The work was reapplied on the upstream tree instead.

Still, only 9 of this fork's commits were the phone work, and 3 of them rewrote
`ds-bot/src/client/styles.js` wholesale (1535 lines here against 1035 upstream). Replaying
them one by one would have conflicted on every one.

The phone work is in fact one appended media-query block, which moved as a unit:

- `ds-bot/src/client/styles.js:978-1502` on the old branch, 525 lines, 13865 bytes,
  starting at `@media (max-width: 768px), (pointer: coarse) {` and ending at the brace
  that balances it. (Note the spaces around `max-width` — the block is easy to miss.)

### The layer bug

`dsh-mobile` sets its own layer ladder in
`dsh-mobile/lib/mobile-layout.js`:

- `.dshm-drawer` z-index 70 (line 417)
- `.dshm-scrim` z-index 65 (line 429)
- `.dshm-details` z-index 80 (line 425)
- `.dshm-overlay` z-index 90 (line 431)

`ds-bot` set its dialogs lower:

- `.bt-settings-layer` z-index 60 (`ds-bot/src/client/styles.js:433` upstream)
- `.bt-mem-layer` z-index 61
- `.bt-palette-layer` z-index 70 (the same as the drawer — whichever renders last wins)

The whale menu's "Bot settings" entry calls `actions.openSettings('general')`
(`ds-bot/src/client/sidebar.js:531`), which renders `.bt-settings-layer`
(`ds-bot/src/client/settings.js:182`). At 60 against the drawer's 70, the dialog sat
entirely behind the drawer. The same held for the memory layer, and the palette layer
was a coin toss.

## Changes

### Upstream sync

Base: `upstream/main` at `9411ac3` (v0.1.6), branch `feature/mobile-v016`.
`ds-bot/package.json` is now `0.1.6`.

Note that upstream v0.1.6 changed `AGENTS.md`: the repository now also holds the desktop
app in `app/`, branches start from `dev` and are named `fix/<issue>-<name>`,
`feat/<issue>-<name>`, `docs/<name>` or `chore/<name>`, a pushed branch is never rebased
or force-pushed, and no AI agent is set as a commit author. This branch is a local
deployment line that does not open a pull request, but the naming and no-force-push
rules were followed anyway.

### Reapplied phone work

- `ds-bot/src/client/header.js` — the pill's `onTouchStart`/`onTouchEnd` gestures: a
  right swipe clicks the mobile drawer toggle, a left swipe opens the details drawer.
  The guard is `dt >= 600 || Math.abs(dx) <= 40 || Math.abs(dx) <= Math.abs(dy) * 1.5`.
- `ds-bot/src/client/browser-pane.js` — the `.bt-panel-backdrop` element and the panel's
  right-swipe close. `BotPanel` now returns a `Fragment` of the backdrop and the `aside`.
- `ds-bot/src/client/sidebar.js` — `dismissMobileDrawer` on the search and new-chat
  buttons; the Connect plugins button became a 36px icon button with an `aria-label` and
  the hard-coded red `!` removed; `AccountLauncher` gained a `touchstart` outside-close
  listener, `stopPropagation` on toggle, and `left` clamped to
  `Math.max(8, Math.min(rect.left, window.innerWidth - 268))`.
- `ds-bot/src/client/palette.js` — the palette backdrop closes on `click` and
  `touchstart`, and the head gained a `Cancel` button (`.bt-palette-close`).
- `ds-bot/src/client/new-chat.js` — `.bt-pane-newchat` plus a right-swipe close.
- `ds-bot/src/client/model-menu.js` — `touchstart` joins the outside-close listeners.
- `ds-bot/src/client/styles.js` — the 525-line phone media-query block, inserted before
  the closing backtick of `CONVERSATION_CSS` (which is the second template literal, the
  one that ended at line 983 before the insert). A second, later block existed. The block
  keeps the upstream note about `!important`: `USAGE_CSS` is injected as its own style
  tag, so a rule here must win on specificity rather than on injection order.

### The layer fix (new)

Section 13 was appended to the phone block in `ds-bot/src/client/styles.js`:

```css
.bt-settings-layer { z-index: 320 !important; }
.bt-mem-layer      { z-index: 300 !important; }
.bt-palette-layer  { z-index: 310 !important; }
.bt-react-strip    { z-index: 290 !important; }
```

320 clears the drawer (70), the details drawer (80) and the overlay (90), while keeping
the dialogs ordered among themselves as before: memory 300 < palette 310 < settings 320.
The whale menu itself stays at 900 but closes before it runs a menu item
(`onClick: () => { setOpen(false); ... }`), so it never overlaps a dialog it opened.

### The stopped-turn fix

The working-pill fix was reapplied whole: `STOPPED_SETTLE_MS` in
`ds-bot/src/host/constants.js`, `clearLiveTurn` / `armStopSettle` / `disarmStopSettle` /
`stopTurn` in `ds-bot/src/host/turns.js` (now exported on `rt`), `stopMemberWork` in
`ds-bot/src/host/groups.js`, and two regression tests in `ds-bot/test/group-work.test.js`.

`clearLiveTurn` was extended to the v0.1.6 field set: upstream's `turn/end` handler now
also clears `shown` and `step`, so the helper clears those too.

## Verification

All commands run from `ds-bot/`.

```
node --import ./test/harness-resolve.mjs --test "test/*.test.js"
  -> tests 549 / pass 549 / fail 0        (v0.1.6 has 547; this adds 2)

node scripts/build-client.mjs --check     -> exit 0
node scripts/lint.mjs                     -> 0 errors, 14 warnings (all upstream code)
```

Smoke test (`dev/smoke.sh` is unusable here: no `bash`, no `pnpm`):

```
-> smoke: all 40 steps passed
```

The bench needs two local fixes, both known from the previous round:

- `TEMP` must be the long form (`C:\Users\Administrator\AppData\Local\Temp`, not
  `C:\Users\ADMINI~1\...`) or `Coder works in a folder of its own` fails: `dev/smoke.mjs`
  uses `realpathSync` and keeps the short name, while the plugin's `realpath` expands it.
- `dev/smoke.mjs` reads the login URL out of `.dsh-test-smoke/web.log`. Starting the
  server by hand does not write that file, so the run must have the current URL written
  into it (`dsh web: http://127.0.0.1:3096/?token=...`), or the login answers 401.

The z-index change is in the built output at `client.js:3328-3332`.

## Deployment

Target: `D:\exe\DSH\data\home\profiles\desktop\node_modules\ds-bot`, now 0.1.6.

`Copy-Item -Recurse` nests into an existing directory, which produced a stray
`dst\src\src`. `robocopy /MIR` replaced it and also removed `src/client/flat-transcript.js`,
which upstream deleted. Every deployed file was checked with `Get-FileHash`: `client.js`,
all of `src/client/` and `src/host/`, and the top-level files all report `match=True`.

`profiles/desktop/package.json` now asks for `"ds-bot": "^0.1.6"`, written BOM-free.

## Commits

- `4ea5794` `fix(host): clear a stopped turn that never reports turn/end`
- `3eabbaf` `feat(mobile): reapply the phone layout and gestures on v0.1.6`

Both on `feature/mobile-v016`, pushed to `origin` as a new branch.

## Open items

- The branch tracks `upstream/main` when created; the tracking link was removed before
  pushing so the work cannot land on the official repository by accident. `git push` must
  name `origin` explicitly.
- The drawer and the settings dialog are two plugins' layer ladders. A future `dsh-mobile`
  release that raises its drawer above 320 would cover the settings dialog again.
- The phone block keeps upstream's upstream-facing comments in Chinese, matching the rest
  of that block.
