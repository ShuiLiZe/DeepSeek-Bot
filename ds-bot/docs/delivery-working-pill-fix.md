# 交付记录：working 状态胶囊假死修复

## 目标

手机端 DSH App 群聊里，成员任务被中断或提前结束后，底部 Working 胶囊一直显示「运行命令…」不消失，
必须退出群聊重进或杀掉 App 才恢复（后台进程与实际 API 调用早已停止，无 Token 消耗）。

用户原话 (m00812)：「你干嘛，我叫你修bug」——要求直接修，不要只给分析。

## 根因（host 侧，非移动端前端）

`ds-bot/src/host/turns.js` 的 `live` Map 按 Session 记录「这个 Bot 正在工作」，唯一清空入口是
`turn/end` 处理器。host 每次 roster push 都通过 `channel.js:74-75` 重发同一份 stale
`work: { bots: rt.workView(), rooms: rt.roomWorkView(), approvals: rt.approvalsView() }`，
所以客户端只是忠实渲染 host 持续告知的状态。杀掉 App 能「恢复」只是重新拉 roster。

停成员的按钮路径是 `channel.js:217-218` 的 `stop-member-work` endpoint → `rt.stopMemberWork`
（定义在 `ds-bot/src/host/groups.js:597`）。原实现 cancel 了 turn，但**从不清理 live 条目、
也不设任何兜底**，完全依赖 DSH 发出带 `reason.kind === 'aborted'` 的 `turn/end`：

```js
const agent = await rt.resolveAgent(sessionId)
agent.cancel({ kind: 'user' })
```

两条真实不达路径：

1. Session 已消失 —— `resolveAgent` 抛错，`turn/end` 永远不会来。
2. cancel 落在 Session 正在 teardown、或 run loop 已 unwound 之后 —— DSH 不发 `turn/end`。

任一条命中，`entry.turn` 就永久锁死，胶囊一直转。

## 改动

| 文件 | 内容 |
| --- | --- |
| `ds-bot/src/host/constants.js` | 新增 `export const STOPPED_SETTLE_MS = 15_000`，紧邻既有的 `ROOM_WORK_GRACE_MS` |
| `ds-bot/src/host/turns.js` | 新增 `clearLiveTurn(sessionId, exchangeId)`（与 `turn/end` 处理器同一套字段清空）+ `armStopSettle` / `disarmStopSettle` 兜底定时器；抽出 `stopTurn(sessionId, exchangeId, cancel)`；`case 'turn/end'` 开头 `disarmStopSettle(id)`；新 helper 挂到 `rt` 上 |
| `ds-bot/src/host/groups.js` | `stopMemberWork` 改用 `rt.resolveAgent(...).catch(() => undefined)`；Session 解析不出来时 `rt.clearLiveTurn(sessionId)` 立即清除，否则走 `rt.stopTurn(...)` 设兜底 |
| `ds-bot/test/group-work.test.js` | 新增 2 个回归测试；harness 加 `detach(sessionId)` 让 `resolveAgent` 对指定 Session 抛错 |

关键代码：

```js
// turns.js — 与 turn/end 处理器同一套字段
const clearLiveTurn = (sessionId, exchangeId) => {
  const entry = live.get(sessionId)
  if (entry === undefined || entry.turn === undefined) return
  if (exchangeId !== undefined && entry.info?.exchangeId !== exchangeId) return
  setActivity(sessionId, undefined)
  entry.turn = undefined
  entry.info = undefined
  entry.texts = []
  entry.switched = false
  entry.joined = []
  entry.since = undefined
  entry.tool = undefined
  entry.calls = undefined
  entry.lastText = undefined
  entry.lastCalled = undefined
}
```

```js
// groups.js — 停止按钮路径现在两种不达情形都有出口
const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
if (agent === undefined) rt.clearLiveTurn(sessionId)
else rt.stopTurn(sessionId, undefined, () => agent.cancel({ kind: 'user' }))
```

## 回归测试

`ds-bot/test/group-work.test.js`：

1. `a stopped turn that never reports turn/end stops showing as working` —— 停成员后不发
   `turn/end`，断言胶囊仍在（cancel 是异步请求），`t.mock.timers.tick(STOPPED_SETTLE_MS)` 后
   `work.bots` 与 `activity` 均清空；随后新起的 turn 正常开始与结束，证明兜底不会误清无关 turn。
2. `a stop whose member Session cannot be resolved clears the entry at once` —— Session 不可解析时
   立即清除。

注意 `work.bots` 是**对象**（按 botId 为键），断言用 `Object.keys(...)`，不是数组 `.map`。

## 验证（实测，字面结果）

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 单测 | `node --import ./test/harness-resolve.mjs --test "test/*.test.js"` | **tests 519 / pass 519 / fail 0** |
| 构建一致性 | `node scripts/build-client.mjs --check` | exit 0 |
| lint | `node scripts/lint.mjs` | **0 errors, 14 warnings**（全为上游既有） |
| smoke | `node dev/smoke.mjs smoke 3096` | **all 40 steps passed** |
| 部署 | Get-FileHash 逐一比对 | client.js / src/host/{turns,groups,constants}.js 均 `match=True` |

### smoke 环境说明（重要，下次别再踩）

本机没有 `bash` 与 `pnpm`，`dev/bench.sh` 跑不起来。用等价方式手工起 bench：

- Git Bash：`D:\tool\Git\bin\bash.exe`；dsh CLI：`ds-bot\dev\harness\node_modules\.bin\dsh.cmd`
  （`.bin\dsh` 是 shell 脚本，`node` 直接跑会报 `SyntaxError: missing ) after argument list`）。
- bench home：`D:\workspaces\DeepSeek-Bot\.dsh-test-smoke`；profile 里 `ds-bot` 用 junction 指到源码，
  `@deepseek-ai` 用 junction 指到 `ds-bot\dev\harness\node_modules\@deepseek-ai`。
- mock：`MOCK_PORT=8796 MOCK_DELAY_MS=300 MOCK_LOG=<home>\mock.jsonl node dev/mock-llm.mjs <home>`
- web：`DSH_HOME=<home> DEEPSEEK_BASE_URL=http://127.0.0.1:8796/v1 DEEPSEEK_API_KEY=mock-key dsh.cmd --profile web --patch <home>\bench.patch.yml --no-open --port 3096`
- **PowerShell 写 JSON/YAML 必须用 `[System.IO.File]::WriteAllText($p,$s,(New-Object System.Text.UTF8Encoding($false)))`**：
  `Set-Content -Encoding UTF8` 会写 BOM，profile 加载报
  `SyntaxError: Unexpected token '锘?, "锘縶\n  "name"... is not valid JSON`。
- **`TEMP` 必须是长名**：本机 `%TEMP%` 是 `C:\Users\ADMINI~1\AppData\Local\Temp`（8.3 短名）。
  `smoke.mjs:284` 用 `realpathSync(mkdtempSync(...))` 保留短名，而 `folders.js:26` 的
  `realpath()` 来自 `fs/promises` 会展开成长名，两者字符串永不相等 →
  `FAIL Coder works in a folder of its own: folder not saved`。
  跑 smoke 前设 `$env:TEMP=$env:TMP="C:\Users\Administrator\AppData\Local\Temp"`。
  **这是 bench 环境问题，不是插件 bug**：已用 `git stash` 去掉本轮改动复现同一失败，确认非回归。
- 每轮 smoke 前必须清 `bot\`、`sessions\`、`mock.jsonl`，否则报
  `create-bot: A Bot named Coder already exists`。
- 停 bench 要按端口查占用进程（`Get-NetTCPConnection -LocalPort 3096`）再杀，pid 文件里的父进程
  退出后 dsh 子进程可能仍占着端口，导致下一轮 web 起不来、插件卡在
  `Plugins waiting for services`。

## 产物路径

- 源码：`ds-bot/src/host/constants.js`、`ds-bot/src/host/turns.js`、`ds-bot/src/host/groups.js`
- 测试：`ds-bot/test/group-work.test.js`
- 运行环境：`D:\exe\DSH\data\home\profiles\desktop\node_modules\ds-bot\`
- 提交：`1dc597f fix(host): clear a stopped turn that never reports turn/end`（4 files, +133/−10），
  已推送 `origin/feature/mobile-pill-gesture`

## 未解决项

- 手机端真机复验：需用户在手机上再触发一次「中断成员后胶囊一直转」的场景确认。改动已部署到桌面
  profile；手机端连的若是同一个 host 进程，需重启 DSH 让新的 host 代码生效。
