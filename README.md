# dsh-suggest-actions（建议按钮）

<img src="assets/icon.svg" width="96" alt="图标">

给 DeepSeek Harness 的每条回复末尾加一排**可点的下一步建议**。点一下，那句话就直接作为你的消息发出去——不用自己打。

它解决的是"我读完了，接下来想让它干 A 还是 B"这件事：与其自己组织语言，不如直接点。

## 和"输入框补全"不是一回事

生态里已经有几个"下一句建议"插件（`dsh-input-assist`、`dsh-prompt-for-me`、`dsh-suggest-ghost`），它们都是**输入框里的 ghost text**：插件猜你想说什么，给一条，按 Tab 采纳，**然后还要自己按回车**。

这个插件换了个思路：

|  | 输入框补全类 | 本插件 |
|---|---|---|
| 位置 | 输入框内 | **回复下方**（轮次尾部） |
| 条数 | 1 条 | **2-3 条** |
| 内容来源 | 插件猜你想说什么 | **模型按上下文主动给**——"重启 DSH 让按钮生效"这种具体动作，补全类猜不出来 |
| 采纳 | Tab，再自己按回车 | **点一下就发出** |
| 不想要它 | 得忽略或按 Esc | 不看就行，它不占输入框 |

## 安装

```bash
dsh plugin --profile desktop add dsh-suggest-actions
```

装完**重启 DSH 并刷新一次页面**——host 只在启动时读插件清单，客户端代码也要重新加载。这两步缺一不可（踩过）。

## 它怎么工作

- **Host 侧**：注册一个 `suggest_actions` 工具。它**不阻塞、立即返回**——模型在收尾时调用一次，参数里带 2-3 条建议，这一轮正常结束。
- **客户端侧**画两处：
  - `tool.call.toolview` 挂一个**静默采集器**：渲染时把建议记进插件内存，不画任何东西；
  - `conversation.chat.turnTail`（轮次尾部）挂**展示器**：读内存、画按钮。
- **为什么放轮次尾部**：DSH 的"过程组折叠"会把思考与工具调用收成一行，画在工具卡片里的东西默认看不见；轮次尾部在折叠范围之外，所以过程收起来按钮照样露着（这条是读了官方源码才定的，见下）。
- **点按钮**走的是 `conversation.input.shell(sessionId).actions`：写进会话输入框 → 提交。和用户自己敲键盘回车是同一条路。

## 已知限制

- 需要 DSH **0.1.7** 这一线（用到了 `conversation.chat.turnTail`、`conversation.input.shell`、`tool.call.toolview`）。
- 按钮文字由模型给：太长会显得笨重，建议每条不超过 20 字。
- 点击**直接发送**，没有二次确认——这是设计意图，不是疏忽。
- 一次点击有约 0.9 秒的防连点。

## 开发者备注

实现细节、踩过的坑、以及"为什么不用另外三个位置"都在仓库注释里；`conversation.chat.turnTail` 这个落点是从官方 72 个 slot 扩展点里筛出来的。

## 许可

MIT

## 配置

在 profile 的 `cordis.patch.yml` 里本插件那一行加 `config`：

```yaml
- id: suggest-actions
  name: 'dsh-suggest-actions'
  config:
    maxActions: 3     # 单次最多显示几条建议（1–6），超出的丢弃
```

## 开发

```bash
pnpm test      # 22 个单测，零外部依赖（node:test）
```

代码分工：

- `lib/normalize.js` —— host 侧的清洗规则（空白、去重、上限），纯函数、可单测
- `lib/index.js` —— 注册工具、读配置，把参数交给 normalize
- `lib/parse.js` —— 客户端解析逻辑的**参照实现**
- `lib/client.js` —— 浏览器侧。里面 `#region sync:parse-actions` 标记的那段是 `lib/parse.js` 的**逐字副本**（客户端 bundle 必须自包含，host 只登记入口文件、相对 import 取不到）；`test/sync.test.mjs` 用同一批输入比对两边，漂移即测试失败

边界行为都有测试锁定：非数组、坏 JSON、空白 label、重复 label、超限条数、`maxActions` 越界。UI 侧另有：按钮最多 520px 宽、文案最多两行（悬停显示全文）、点击后 0.9 秒防连点、每个建议只显示一次（历史轮次重新挂载时不会捡到最新建议）。
