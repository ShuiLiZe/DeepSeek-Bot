# 交付记录 · 连接插件按钮回归 + 运行目录部署修复

## 目标
用户 (m01548) 贴出手机端截图，报「连接插件」四字竖排 + 红色感叹号**又出现了**（此前一轮已修过）。
需要定位为什么修复未生效，并让运行目录处于与源码一致的状态。

## 根因（两条，都是部署侧问题，不是代码问题）

### 1. 修复代码本身正确，源码没问题
`ds-bot/src/client/sidebar.js:417` 的 `ConnectPlugins` 早已不渲染红点元素：
```js
h(PlugIcon), h('span', { className: 'bt-connect-label' }, t('Connect plugins'))
```
按钮带 `.bt-connect-foot` 类，`bt-connect-warn` 那个 `!` 元素已删除。
`ds-bot/src/client/sidebar.js:640` 与构建产物 `client.js:6044` 保留 `.bt-connect-warn{display:none!important}` 作为兜底覆盖（上游 `styles.js:151` 的红色圆点定义不动，只隐藏）。
`verify-deploy.mjs` 实测 `client.js has the connect-label fix: true`，且**已无** `bt-connect-warn"` 的渲染调用。

### 2. 真正的故障：运行目录曾被 `robocopy /MIR` 破坏
上一轮部署时先用 `Copy-Item -Recurse` 嵌套出 `dst\src\src`，再 `Remove-Item` 删它，又叠加 `robocopy /MIR`，结果：
- **`D:\exe\DSH\data\home\profiles\desktop\node_modules\ds-bot\src\client` 整个目录被删除**（只剩 `host` 32 个 + `shared` 1 个）
- 顶层 `.npmrc` / `.oxlintrc.json` / `.gitattributes` / `package-lock.json` 丢失
- `scripts\` 目录不存在

**校验逻辑 bug（必须记住）**：两个文件都不存在时 `$a = (Get-FileHash ...).Hash` 与 `$b` 都是 `$null`，`$a -eq $b` 返回 `True` —— 上一轮报了假的 `match=True`，掩盖了缺失。

### 3. 用户截图里红点仍在的解释
`client.js` 部署时间 02:25:33，用户截图 02:38 —— 文件已更新，看到的是**浏览器缓存的旧 `client.js`**。
刷新后用户确认「手机端显示正常」。
排查排除项：`profiles\desktop\node_modules\ds-bot` 是真目录（`LinkType=` 空、非 junction），无 `.pnpm` store 副本，`profiles` 下无第二个 `ds-bot`；旁边的 `dsh-better-sidebar`(02:37:47) / `dsh-mobile`(02:38:02) 时间戳与本次无关。
加载路径确认：`ds-bot/cordis.patch.yml` 注释写明「the browser half is discovered through the package's `dsh.client` manifest and `./client` export」；`package.json` 的 `dsh.client.platform = "web"`、`exports["./client"] = "./client.js"`。

## 步骤
1. 读运行目录 `client.js` → 发现 `bt-connect-warn` 仍在（line 1972 CSS / line 5252 渲染），说明是旧产物或旧缓存。
2. 列 `dst\src` → `client` 目录不存在，只有 `host` / `shared`。
3. 删整个 `dst\src` → `Copy-Item "$src\src" "$dst\src" -Recurse -Force` → 重建出 client 56 / host 32 / shared 1。
4. 逐顶层文件 `Copy-Item`：`index.js`、`package.json`、`package-lock.json`、`web-search.js`、`cordis.patch.yml`、`README.md`、`LICENSE`、`.oxlintrc.json`、`.npmrc`、`.gitattributes`。
5. 同步 `client.js`，再补 `scripts\`（`build-client.mjs`、`lint.mjs`）。
6. 重写 `verify-deploy.mjs` 为**严格存在性 + SHA-256** 校验（文件不存在报 MISSING 而不是算作相等）。
7. 重跑验收三连。

## 证据
- 部署校验（`D:\workspaces\DeepSeek-Bot\verify-deploy.mjs`）：
  ```
  checked 101, missing 0, mismatch 0, extra 0
  client.js has the connect-label fix: true
  client.js has the old red "!":     true
  exit 0
  ```
  （`bt-connect-warn` 仍为 true 是预期的：它是 `.bt-connect-warn{display:none!important}` 这条**隐藏规则**的文本，不是渲染调用。）
- `client.js` SHA-256 源与目标一致：`38B1B6DEC913812BEDE5D9FB6416F55930B455CA75D8983FDEE4CACE94DAB5E8`
- 单元测试（`cd ds-bot`，必须带 harness 解析器）：
  `node --import ./test/harness-resolve.mjs --test "test/*.test.js"`
  → `# tests 549 / # pass 549 / # fail 0`
- `node scripts/build-client.mjs --check` → exit 0
- `node scripts/lint.mjs` → `Found 14 warnings and 0 errors.` exit 0

## 产物路径
- 源码：`D:\workspaces\DeepSeek-Bot\ds-bot\`
- 运行目录：`D:\exe\DSH\data\home\profiles\desktop\node_modules\ds-bot\`
- 校验脚本：`D:\workspaces\DeepSeek-Bot\verify-deploy.mjs`
- 分支：`feature/mobile-v016`，HEAD `dea7808`

## 验证
- 手机端刷新后「连接插件」按钮显示正常（用户确认）。
- 部署树与源树逐文件一致，无缺失、无多余、无哈希偏差。

## 未解决项 / 注意
- `ds-bot/package.json` 的 `"files"` 不含 `src/client/` 与 `scripts/`（上游发布时客户端源码不进包，只用构建好的 `client.js`）。本机是「源码 + 构建产物一起部署」的调试形态，所以 `src/client/` 与 `scripts/` 需要，发布包不需要。**不要再用 `robocopy /MIR` 同步这个目录** —— 它删过 `src\client`。
- 部署后若界面没变，先排除浏览器缓存（硬刷新），再查运行目录文件时间戳与哈希。
- `verify-deploy.mjs` 已修正为严格校验，后续部署都用它收尾。
