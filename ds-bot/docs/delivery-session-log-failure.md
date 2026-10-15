# Session log write failures stop flooding the diagnostics, and one bad Session stops the group

## What was reported

The phone's feedback panel showed `recent errors · 73`, all the same two lines:

```
format v4 tool/result at seq 62 requires toolCallId matching its tool source
group delivery to ds4pro failed: SessionFormatError: format v4 tool/result at seq 62 requires toolCallId matching its tool source
```

`ds4pro · group "汉化小分队" · 模型调用` was the source of the first line, `DS Bot` of the second, and the timestamps (12:50, 12:56, 12:58) repeated with every group delivery.

## Root cause

A tool call the model streamed without an `id` and without a `name` was recorded as a `tool/call`
whose `callId` was empty. DSH's released-v4 codec refuses the matching `tool/result`:

```
format v4 tool/result at seq 62 requires toolCallId matching its tool source
```

`assertV4ToolResultMessage` requires `source.callId === toolCallId` and both to be non-empty
strings. The append cursor then rolls back, so **every later append to that Session fails the
same way** — the Session's log is bricked, not merely the one event.

The Session on disk (`session-b06c2c2b-a8d5-4650-b244-976d90ff3204`, title `ds4pro · 汉化小分队`)
stops at 63 rows and was last written at 12:44:35; it never grew again. Seq 62 there is a normal
`tool/call`, so the failure is only visible at the moment of the crash — by the time a scan runs,
the physical file has already been repaired by the tail recovery path.

The one part that is ds-bot's own: `deliver` retried on every group round, so a single unreadable
Session logged the identical failure for each delivery, without end. That is what turned one event
into 73 panel entries.

## What changed

- `ds-bot/src/host/constants.js`: `LOG_WRITE_FAILURES_MAX = 3` (how often one unreadable Session is
  reported) and `LOG_WRITE_FAILURE_MARK = 'SessionFormatError'` (the codec's error name).
- `ds-bot/src/host/delivery.js`: the `flush` call is wrapped. A codec format failure is recognised
  by name plus message shape (`tool/result`, `toolCallId`, `format v*`), counted per Session, and
  reported at most `LOG_WRITE_FAILURES_MAX` times; the error still reaches the caller so the group
  resolves its round and goes on. Anything else — a transient `EACCES`, say — propagates untouched.
- `ds-bot/test/group-work.test.js`: a regression test drives five rounds against a Session whose
  `flush` throws the reported error, and asserts the warning count stops at the cap while the group
  keeps taking rounds.

## Verification

Run from `ds-bot/`:

```
node --import ./test/harness-resolve.mjs --test "test/*.test.js"   # 550 tests, 550 pass, 0 fail
node scripts/build-client.mjs --check                              # exit 0
node scripts/lint.mjs                                              # 0 errors, 14 warnings
```

The unit suite was run three times (550/550 each) because a concurrent build test had shown a
one-off failure. That failure was real, not flaky: `src/client/styles.js` carried a backtick inside
a CSS comment, which closes the surrounding template literal, and esbuild refused the file. The
comment now says `the color property` instead of backtick-quoting it. `client.js` was rebuilt.

Smoke test: `smoke: all 40 steps passed`.

Deployed to `D:\exe\DSH\data\home\profiles\desktop\node_modules\ds-bot` and checked with
`verify-deploy.mjs`: `checked 101, missing 0, mismatch 0, extra 0`.

## What this does and does not fix

It stops the flood and keeps the group running. It does **not** un-brick the Session: the log is
already at a state the codec refuses, and ds-bot may not patch DSH to write around it. Repairing
that Session needs DSH itself, or deleting its log so the member starts a fresh part.
