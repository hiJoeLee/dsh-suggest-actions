/**
 * dsh-suggest-actions —— 客户端侧。
 *
 * 两处注册，分工明确：
 *   1. `tool.call.toolview`（工具卡片）——**静默采集**：把这一轮的建议记进插件内存，
 *      自己不显示任何东西（它在"过程组"里，折叠起来本来就看不见）。
 *   2. `conversation.chat.turnTail`（轮次尾部）——**显示按钮**。这个位置在
 *      `TurnTailNodeView` 里，和"点赞那排"同一个容器、排在它之前，
 *      **不在过程折叠范围内**，所以过程收起来它也露着。
 *
 * 依据（2026-09-26 读源码确认）：
 *   - 折叠用的是 HTML `hidden` 属性（`hidden": processHidden`），不是卸载，
 *     所以采集组件在被折叠时**仍然会渲染**，数据拿得到；
 *   - `turnTail` 由 `renderSlot("conversation.chat.turnTail", { turn, seq, openFile })`
 *     渲染，本身不带 sessionId，靠 `inject: (sessionId) => ...` 注入；
 *   - 点一下走 `conversation.input.shell(sessionId).actions` 的 setDraft + submit，
 *     和用户自己敲键盘是同一条路。
 */
"use strict";
(() => {
	/** 视觉意图：回复下方的一排快速操作，安静但不隐形——浅灰底、无边框、13px。 */
	const CSS = [
		// 宽度：整列按"最长的那条标签"定宽（grid 的 max-content 列），几条按钮因此一样宽。
		// 全文要用 contain:inline-size 排除出宽度计算，否则它会把整列撑宽。
		".dsh-suggest{display:grid;grid-template-columns:max-content;align-items:start;gap:10px;padding:4px 0 2px}",
		".dsh-suggest-item{display:flex;flex-direction:column;gap:4px;min-width:0}",
		".dsh-suggest-btn{display:flex;flex-direction:column;gap:4px;align-items:stretch;width:100%;max-width:min(100%,520px);box-sizing:border-box;padding:10px 14px;border:0;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-interactive-bg-hover,#f1f2f4);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:13px;line-height:1.5;text-align:left;cursor:pointer;transition:background 80ms}",
		".dsh-suggest-row{display:flex;align-items:center;gap:10px;min-width:0}",
		".dsh-suggest-full{contain:inline-size;max-height:0;opacity:0;overflow:hidden;color:var(--dsw-alias-label-secondary,#6b6f76);font-size:12px;line-height:1.6;word-break:break-word;transition:max-height 160ms ease,opacity 160ms ease}",
		".dsh-suggest-item:hover .dsh-suggest-full,.dsh-suggest-item:focus-within .dsh-suggest-full{max-height:9em;opacity:1;overflow:auto}",
		".dsh-suggest-btn:hover{background:var(--dsw-alias-interactive-bg-active,#e4e6ea)}",
		".dsh-suggest-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}",
		".dsh-suggest-btn:disabled{opacity:.5;cursor:default}",
		".dsh-suggest-btn[data-recommended]{font-weight:600}",
		".dsh-suggest-rec{flex:none;font-size:11px;line-height:1.7;padding:0 7px;border-radius:999px;background:var(--dsw-alias-brand-primary,#4176e6);color:#fff}",
		".dsh-suggest-more{justify-self:start;display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:0;background:none;color:var(--dsw-alias-label-secondary,#6b6f76);font:inherit;font-size:12px;line-height:1.8;cursor:pointer;border-radius:var(--dsw-radius-sm,6px)}",
		".dsh-suggest-more:hover{color:var(--dsw-alias-label-primary,#1a1a1a);background:var(--dsw-alias-interactive-bg-hover,#f1f2f4)}",
		".dsh-suggest-more:disabled{opacity:.5;cursor:default}",
		".dsh-suggest-label{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}",
		".dsh-suggest-arrow{flex:none;color:var(--dsw-alias-label-tertiary,currentColor);opacity:.7}"
	].join("");

	/** 官方 styles 服务优先，取不到就退回自己插一个 <style>。 */
	function installStyles(ctx) {
		try {
			const styles = ctx.get("styles");
			if (styles !== undefined && styles !== null && typeof styles.insert === "function") {
				styles.insert(CSS);
				return;
			}
		} catch {}
		try {
			const tag = document.createElement("style");
			tag.textContent = CSS;
			document.head.appendChild(tag);
		} catch {}
	}

	/**
	 * 读 host 交回来的最终列表：清洗、去重、排序、截断都由 host 定，界面照抄。
	 *
	 * 客户端 bundle 拿不到插件配置（`maxActions`），上限在本地算不出来；host 把结果随
	 * 工具结果一起送过来（`render` 里那段 JSON），规则因此只剩一份。
	 *
	 * ⚠️ 取不到就是空数组——**这里没有兜底**。真取不到，界面一条按钮都不会出现。
	 *
	 * @param block - toolview 组件拿到的 block。
	 * @returns 建议列表；取不到返回空数组。
	 */
	function readHostActions(block) {
		const content = block !== null && typeof block === "object" && "kind" in block ? block.content : undefined;
		if (!Array.isArray(content)) return [];
		for (const entry of content) {
			const parts = Array.isArray(entry?.content) ? entry.content : [entry];
			for (const part of parts) {
				if (typeof part?.text !== "string") continue;
				let parsed;
				try {
					parsed = JSON.parse(part.text);
				} catch {
					continue;
				}
				if (parsed !== null && typeof parsed === "object" && Array.isArray(parsed.actions)) {
					return parsed.actions;
				}
			}
		}
		return [];
	}

	/**
	* 用用户的身份发一条消息：写草稿 → 等草稿真的落定 → 提交。
	*
	* 两步之间必须等：setDraft 走 Lexical 的异步更新，而 submit 读的是编辑器投影，
	* 同一 tick 里连着调，提交上去的还是空草稿。
	*
	* @param ctx - 插件上下文。
	* @param sessionId - 目标会话。
	* @param text - 要发出去的文本。
	*/
	function sendAsUser(ctx, sessionId, text) {
		const conversation = ctx.get("conversation");
		const input = conversation === undefined || conversation === null ? undefined : conversation.input;
		const shell = input !== undefined && input !== null && typeof input.shell === "function"
			? input.shell(sessionId)
			: undefined;
		if (shell === undefined || shell === null) throw new Error(`no composer shell for session "${sessionId}"`);
		const actions = shell.actions;
		const setDraft = actions !== undefined && actions !== null && typeof actions.setDraft === "function"
			? (value) => actions.setDraft(value)
			: typeof shell.setDraft === "function" ? (value) => shell.setDraft(value) : undefined;
		if (setDraft === undefined) throw new Error("composer shell exposes no setDraft");
		const submit = actions !== undefined && actions !== null && typeof actions.submit === "function"
			? () => actions.submit()
			: undefined;
		if (submit === undefined) throw new Error("composer shell exposes no submit");
		setDraft(text);
		let tries = 0;
		const settle = () => {
			let draft;
			try {
				draft = shell.state.getSnapshot().draft;
			} catch {
				draft = undefined;
			}
			if (draft === text || tries >= 12) {
				try {
					submit();
				} catch (error) {
					console.error("[dsh-suggest-actions] submit failed:", error);
				}
				return;
			}
			tries += 1;
			window.setTimeout(settle, 25);
		};
		window.setTimeout(settle, 0);
	}

	/** sessionId → { actions, seq, taken }；`take` 取走一次后即作废。 */
	const suggestions = new Map();
	let suggestionSeq = 0;

	/** 采集组件在渲染时调用：把这一轮的建议记下来。 */
	function remember(sessionId, actions) {
		if (typeof sessionId !== "string" || sessionId === "" || actions.length === 0) return;
		const previous = suggestions.get(sessionId);
		if (previous !== undefined && JSON.stringify(previous.actions) === JSON.stringify(actions)) return;
		suggestionSeq += 1;
		suggestions.set(sessionId, { actions, seq: suggestionSeq, taken: false });
	}

	/**
	* 读出这个会话最近一次的建议。
	*
	* 这里**不能**做"取一次即作废"：那会让行为依赖渲染顺序，而渲染顺序不由插件
	* 控制。曾经加过作废标记，结果最新一轮的展示器可能先于它的采集器渲染，
	* 读到旧值后把条目标成已取走，采集器随后写入的新数据就再没人看得见 ——
	* 按钮整体消失。取舍：宁可历史轮次偶尔多显示一份最新建议，也不能让最新
	* 一轮没有按钮。
	*
	* @param sessionId - 目标会话。
	* @returns 建议列表。
	*/
	function take(sessionId) {
		const entry = suggestions.get(sessionId);
		return entry === undefined ? [] : entry.actions;
	}
	/** 点击逻辑：防连点 + 发送。 */
	function usePicker(React, ctx, sessionId) {
		const [pending, setPending] = React.useState(false);
		const busy = React.useRef(false);
		const pick = (item) => {
			if (busy.current || sessionId === "") return;
			busy.current = true;
			const text = typeof item.prompt === "string" && item.prompt !== "" ? item.prompt : item.label;
			setPending(true);
			try {
				sendAsUser(ctx, sessionId, text);
			} catch (error) {
				console.error("[dsh-suggest-actions] send failed:", error);
			}
			window.setTimeout(() => {
				busy.current = false;
				setPending(false);
			}, 900);
		};
		return [pending, pick];
	}

	/** 采集器：挂在工具卡片上，只记数据，不画东西。 */
	function createCapture(React, ctx) {
		return function SuggestActionsCapture(props) {
			const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
			// 规则只有一份，在 host：这里只把 host 交回来的列表记下来。
			remember(sessionId, readHostActions(props.block));
			return null;
		};
	}

	/** 默认直接露出几条，其余折叠起来。 */
	const VISIBLE_ACTIONS = 3;

	/**
	 * 界面文案：只分中英两套，够用就行，不引翻译框架。
	 *
	 * ⚠️ 组件的 props 里其实带了官方翻译入口 `t`（插件笔记里记着这一条），但它的
	 * 词条格式还没查清，所以这里先按界面语言自己判断；查清之后可以整段换掉。
	 * 判断不出语言时按中文——那是原来的行为。
	 */
	function uiStrings() {
		const lang = String(document.documentElement?.lang || window.navigator?.language || "").toLowerCase();
		const zh = lang === "" || lang.startsWith("zh");
		return zh
			? { recommended: "推荐", more: (n) => `还有 ${n} 条`, less: "收起" }
			: { recommended: "Recommended", more: (n) => `${n} more`, less: "Show less" };
	}

	/**
	 * 一条建议：按钮 + 悬停展开的全文。
	 *
	 * 全文**放在按钮外面**（做按钮的兄弟节点）：一是不参与按钮宽度计算，二展开之后
	 * 点它不会误发——它原先长在按钮里，想选中文字复制一下都会点出去。
	 */
	function actionItem(React, item, key, pending, pick, text) {
		// 只有确实比标签更长、内容也不同的 prompt 才值得展开；缺省时发送的就是 label 本身。
		const full = typeof item.prompt === "string" && item.prompt !== "" && item.prompt !== item.label
			? item.prompt
			: undefined;
		return React.createElement("div", {
			key,
			className: "dsh-suggest-item"
		}, React.createElement("button", {
			type: "button",
			className: "dsh-suggest-btn",
			"data-recommended": item.recommended === true ? "" : undefined,
			disabled: pending,
			onClick: () => pick(item)
		}, React.createElement("span", {
			className: "dsh-suggest-row"
		}, React.createElement("span", {
			className: "dsh-suggest-label", title: item.label
		}, item.label), item.recommended === true ? React.createElement("span", {
			className: "dsh-suggest-rec"
		}, text.recommended) : null, React.createElement("span", {
			className: "dsh-suggest-arrow",
			"aria-hidden": "true"
		}, "\u2192"))), full === undefined ? null : React.createElement("span", {
			className: "dsh-suggest-full"
		}, full));
	}

	/** 展示器：挂在轮次尾部，画按钮；超过 VISIBLE_ACTIONS 条就折叠，展开状态不记忆。 */
	function createTail(React, ctx) {
		return function SuggestActionsTail(props) {
			const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
			const [items, setItems] = React.useState(() => take(sessionId));
			// 展开状态**故意不记忆**：组件重新挂载（滚动、切会话回来）就回到收起，
			// 否则历史轮次会把"还有 N 条"全撑开，屏幕很快失控。
			const [expanded, setExpanded] = React.useState(false);
			// 采集器可能比这里晚一拍（同在轮次尾部视图里渲染），挂载后补读一次。
			React.useEffect(() => {
				if (sessionId !== "" && items.length === 0) setItems(take(sessionId));
			}, []);
			const [pending, pick] = usePicker(React, ctx, sessionId);
			if (items.length === 0) return null;
			const text = uiStrings();
			const overflow = items.length > VISIBLE_ACTIONS;
			const visible = expanded || !overflow ? items : items.slice(0, VISIBLE_ACTIONS);
			const children = visible.map((item, index) => actionItem(React, item, `a${index}`, pending, pick, text));
			if (overflow) children.push(React.createElement("button", {
				key: "toggle",
				type: "button",
				className: "dsh-suggest-more",
				disabled: pending,
				onClick: () => setExpanded(!expanded)
			}, expanded ? `${text.less} \u25B4` : `${text.more(items.length - VISIBLE_ACTIONS)} \u25BE`));
			return React.createElement("div", {
				className: "dsh-suggest",
				"data-tool": "suggest_actions"
			}, children);
		};
	}

	window.__ModuleLoader__.load({
		id: "dsh-suggest-actions",
		factory: (require) => {
			const React = require("react");
			return {
				name: "dsh-suggest-actions",
				inject: ["slots"],
				apply(ctx) {
					installStyles(ctx);
					ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
						name: "tool.call.toolview",
						key: "suggest_actions"
					}, createCapture(React, ctx)));
					ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
						name: "conversation.chat.turnTail",
						id: "suggest-actions",
						inject: (sessionId) => ({ sessionId })
					}, createTail(React, ctx)));
				}
			};
		}
	});
})();
