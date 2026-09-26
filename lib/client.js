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
	/** 视觉照 Trae 那排比着调的：浅灰底、无边框、13px。 */
	const CSS = [
		".dsh-suggest{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:4px 0 2px}",
		".dsh-suggest-btn{display:inline-flex;align-items:center;gap:10px;max-width:min(100%,520px);box-sizing:border-box;padding:10px 14px;border:0;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-interactive-bg-hover,#f1f2f4);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:13px;line-height:1.5;text-align:left;cursor:pointer;transition:background 80ms}",
		".dsh-suggest-btn:hover{background:var(--dsw-alias-interactive-bg-active,#e4e6ea)}",
		".dsh-suggest-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}",
		".dsh-suggest-btn:disabled{opacity:.5;cursor:default}",
		".dsh-suggest-label{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}",
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

	// #region sync:parse-actions —— 必须与 lib/parse.js 逐字等价（test/sync.test.mjs 会比对）
	/**
	* 从卡片数据里读出建议列表：先取出原始参数，再按与 host 相同的规则清洗。
	*
	* 卡片有未落定/已落定两种形状，参数位置不同（官方 ui-skill 的 skillRowModel 是同一套判断）。
	*
	* @param block - toolview 组件拿到的 block。
	* @param maxActions - 最多保留几条；非法值退回 3，并夹在 1..6。
	* @returns 清洗后的列表，每项 `{ label, prompt? }`。
	*/
	function parseActions(block, maxActions = 3) {
		if (block === undefined || block === null) return [];
		const settled = "kind" in block;
		const call = settled ? block.call : undefined;
		const argsRaw = (settled ? (call === undefined ? undefined : call.argsRaw) : block.argsRaw) ?? "";
		if (typeof argsRaw !== "string" || argsRaw === "") return [];
		let list;
		try {
			const parsed = JSON.parse(argsRaw);
			if (parsed === null || typeof parsed !== "object") return [];
			list = parsed.actions;
		} catch {
			return [];
		}
		if (!Array.isArray(list)) return [];
		const limit = Number.isFinite(maxActions) ? Math.max(1, Math.min(6, Math.trunc(maxActions))) : 3;
		const out = [];
		const seen = new Set();
		for (const item of list) {
			if (item === null || typeof item !== "object") continue;
			const label = typeof item.label === "string" ? item.label.replace(/\s+/g, " ").trim() : "";
			if (label === "") continue;
			const key = label.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			const prompt = typeof item.prompt === "string" && item.prompt.trim() !== "" ? item.prompt.trim() : undefined;
			out.push(prompt === undefined ? { label } : { label, prompt });
			if (out.length >= limit) break;
		}
		return out;
	}
	// #endregion sync:parse-actions

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
	* 取走这个会话的建议 —— **取一次就作废**。
	*
	* 渲染顺序是「第 N 轮的采集器 → 第 N 轮的轮次尾部 → 第 N+1 轮的采集器…」，
	* 所以每个轮次尾部拿到的正是自己那一轮的建议。作废标记是防御：历史轮次的
	* 组件因滚动或切换会话而重新挂载时，不会捡到最新一轮的建议显示在自己下面。
	*
	* @param sessionId - 目标会话。
	* @returns 建议列表；已被取走则返回空数组。
	*/
	function take(sessionId) {
		const entry = suggestions.get(sessionId);
		if (entry === undefined || entry.taken === true) return [];
		entry.taken = true;
		return entry.actions;
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
			remember(sessionId, parseActions(props.block));
			return null;
		};
	}

	/** 展示器：挂在轮次尾部，画按钮。 */
	function createTail(React, ctx) {
		return function SuggestActionsTail(props) {
			const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
			const [items, setItems] = React.useState(() => take(sessionId));
			// 采集器可能比这里晚一拍（同在轮次尾部视图里渲染），挂载后补读一次。
			React.useEffect(() => {
				if (sessionId !== "" && items.length === 0) setItems(take(sessionId));
			}, []);
			const [pending, pick] = usePicker(React, ctx, sessionId);
			if (items.length === 0) return null;
			return React.createElement("div", {
				className: "dsh-suggest",
				"data-tool": "suggest_actions"
			}, items.map((item, index) => React.createElement("button", {
				key: `${index}`,
				type: "button",
				className: "dsh-suggest-btn",
				disabled: pending,
				onClick: () => pick(item)
			}, React.createElement("span", {
				className: "dsh-suggest-label", title: item.label
			}, item.label), React.createElement("span", {
				className: "dsh-suggest-arrow",
				"aria-hidden": "true"
			}, "\u2192"))));
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
