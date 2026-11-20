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
 *   3. 每条建议右侧还挂一个小按钮（输入框图标，见 `fillComposer`）：把这句话放进
 *      输入框、**不发送**，用户改完自己按回车。
 */
"use strict";
(() => {
	/** 视觉意图：回复下方的一排快速操作，安静但不隐形——浅灰底、无边框、13px。 */
	const CSS = [
		// 宽度：整列按"最长的那条标签"定宽（grid 的 max-content 列），几条按钮因此一样宽。
		// 全文要用 contain:inline-size 排除出宽度计算，否则它会把整列撑宽。
		".dsh-suggest{display:grid;grid-template-columns:max-content;align-items:start;gap:10px;padding:4px 0 2px}",
		".dsh-suggest-item{display:flex;flex-direction:column;gap:4px;min-width:0}",
		".dsh-suggest-line{display:flex;align-items:center;gap:8px;min-width:0}",
		".dsh-suggest-btn{display:flex;flex-direction:column;gap:4px;align-items:stretch;flex:1 1 auto;width:auto;min-width:0;max-width:min(100%,520px);box-sizing:border-box;padding:10px 14px;border:0;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-interactive-bg-hover,#f1f2f4);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:13px;line-height:1.5;text-align:left;cursor:pointer;transition:background 80ms}",
		".dsh-suggest-row{display:flex;align-items:center;gap:10px;min-width:0}",
		".dsh-suggest-full{contain:inline-size;max-height:0;opacity:0;overflow:hidden;color:var(--dsw-alias-label-secondary,#6b6f76);font-size:12px;line-height:1.6;word-break:break-word;transition:max-height 160ms ease,opacity 160ms ease}",
		".dsh-suggest-item:hover .dsh-suggest-full,.dsh-suggest-item:focus-within .dsh-suggest-full{max-height:9em;opacity:1;overflow:auto}",
		".dsh-suggest-btn:hover{background:var(--dsw-alias-interactive-bg-active,#e4e6ea)}",
		".dsh-suggest-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}",
		".dsh-suggest-btn:disabled{opacity:.5;cursor:default}",
		// 填入按钮：把这条建议放进输入框，让用户改完自己发。常驻可见但低调，悬停提亮。
		".dsh-suggest-fill{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;opacity:.75;transition:background 80ms,color 80ms,opacity 80ms}",
		".dsh-suggest-fill:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f2f4);color:var(--dsw-alias-label-primary,#1a1a1a);opacity:1}",
		".dsh-suggest-fill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}",
		".dsh-suggest-fill:disabled{opacity:.4;cursor:default}",
		".dsh-suggest-fill svg{display:block}",
		".dsh-suggest-btn[data-recommended]{font-weight:600}",
		".dsh-suggest-rec{flex:none;font-size:11px;line-height:1.7;padding:0 7px;border-radius:999px;background:var(--dsw-alias-brand-primary,#4176e6);color:#fff}",
		".dsh-suggest-tag{flex:none;font-size:11px;line-height:1.7;padding:0 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-active,#e4e6ea);color:var(--dsw-alias-label-secondary,#6b6f76)}",
		".dsh-suggest-error{max-width:min(100%,520px);color:var(--dsw-alias-state-error-primary,#c0392b);font-size:12px;line-height:1.6;word-break:break-word}",
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
	 * 取会话输入框的 shell：会话、输入框服务都从 ctx 懒取，取不到就返回 undefined。
	 *
	 * @param ctx - 插件上下文。
	 * @param sessionId - 目标会话。
	 * @returns shell，或 undefined。
	 */
	function composerShell(ctx, sessionId) {
		const conversation = ctx.get("conversation");
		const input = conversation === undefined || conversation === null ? undefined : conversation.input;
		const shell = input !== undefined && input !== null && typeof input.shell === "function"
			? input.shell(sessionId)
			: undefined;
		return shell === undefined || shell === null ? undefined : shell;
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
		const shell = composerShell(ctx, sessionId);
		if (shell === undefined) throw new Error(`no composer shell for session "${sessionId}"`);
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

	/** 点一条建议时真正要用的文本：优先 prompt，退回 label。 */
	function actionText(item) {
		return typeof item.prompt === "string" && item.prompt !== "" ? item.prompt : item.label;
	}

	/**
	* 把建议文本放进当前会话的输入框，**不发送**——用户改完自己按回车。
	*
	* 写进去之前先清空：输入框里原有的内容会被这句替换掉，不留上一句的尾巴。
	*
	* @param ctx - 插件上下文。
	* @param sessionId - 当前会话。
	* @param text - 要放进去的文本。
	*/
	function fillComposer(ctx, sessionId, text) {
		const shell = composerShell(ctx, sessionId);
		if (shell === undefined) throw new Error(`no composer shell for session "${sessionId}"`);
		const actions = shell.actions;
		const setDraft = actions !== undefined && actions !== null && typeof actions.setDraft === "function"
			? (value) => actions.setDraft(value)
			: typeof shell.setDraft === "function" ? (value) => shell.setDraft(value) : undefined;
		if (setDraft === undefined) throw new Error("composer shell exposes no setDraft");
		setDraft(text);
		if (typeof shell.focus === "function") shell.focus();
	}

	/** 填入图标：一个带光标的输入框——点它把建议写进下面那个输入框。 */
	function fillIcon(React) {
		return React.createElement("svg", {
			width: 16,
			height: 16,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true",
			focusable: "false"
		}, React.createElement("rect", {
			x: 1.9,
			y: 3.9,
			width: 12.2,
			height: 8.2,
			rx: 2.2,
			stroke: "currentColor",
			strokeWidth: 1.4
		}), React.createElement("path", {
			d: "M5.6 6.1v3.8",
			stroke: "currentColor",
			strokeWidth: 1.4,
			strokeLinecap: "round"
		}));
	}

	/**
	* 新建一个会话、把界面切过去，再把交接文本放进它的输入框。
	*
	* 为什么不用官方的 fork：fork 带的是整段历史，上下文一样长，省不下钱；
	* 这条要的是"从零开始、只带结论"。所以走 create——新会话落在同一个工作目录，
	* 文本只写进草稿、**不自动发送**，用户能看一眼、再补一句。
	*
	* @param ctx - 插件上下文。
	* @param sessionId - 当前会话，用它推出新会话该落在哪个目录。
	* @param text - 要带过去的文本。
	* @returns 新会话 id。
	*/
	function openNewSession(ctx, sessionId, text) {
		return (async () => {
			const sessions = ctx.get("sessions");
			if (sessions === undefined || sessions === null || typeof sessions.create !== "function") {
				throw new Error("会话服务不可用，建不了新会话");
			}
			const childId = await sessions.create(currentWorkspaceTarget(ctx, sessions, sessionId));
			const uiWorkspace = ctx.get("uiWorkspace");
			if (uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.openSession === "function") {
				uiWorkspace.openSession(childId);
			} else if (typeof sessions.open === "function") {
				sessions.open(childId);
			} else {
				throw new Error(`新会话 ${childId} 已建好，但没找到把它切到前台的办法`);
			}
			await fillDraft(ctx, childId, text);
			return childId;
		})();
	}

	/**
	* 新会话该落在哪儿：先按"当前会话所属的工作区"建，这样它会出现在侧栏同一组里；
	* 工作区读不到就退回当前会话的工作目录，再不行交给 create 用默认值。
	*
	* 为什么不是只给 cwd：官方自己人（ui-workspace）建会话时传的是 workspaceId。
	*
	* @param ctx - 插件上下文。
	* @param sessions - 会话服务。
	* @param sessionId - 当前会话。
	* @returns 传给 `sessions.create` 的参数对象。
	*/
	function currentWorkspaceTarget(ctx, sessions, sessionId) {
		const workspaceId = currentWorkspaceId(ctx, sessionId);
		if (workspaceId !== undefined) return { workspaceId };
		const cwd = currentCwd(sessions, sessionId);
		return cwd === undefined ? {} : { cwd };
	}

	/**
	* 从工作区列表里找当前会话属于哪一个。
	* 读不到不是错误，交给调用方退回别的办法，所以这里不抛。
	*
	* @param ctx - 插件上下文。
	* @param sessionId - 当前会话。
	* @returns 工作区 id，或 undefined。
	*/
	function currentWorkspaceId(ctx, sessionId) {
		const workspaces = ctx.get("workspaces");
		if (workspaces === undefined || workspaces === null || workspaces.list === undefined
			|| workspaces.list === null || typeof workspaces.list.getSnapshot !== "function") return undefined;
		const snapshot = workspaces.list.getSnapshot();
		const items = snapshot === undefined || snapshot === null || !Array.isArray(snapshot.items) ? [] : snapshot.items;
		const current = items.find((item) => item !== null && typeof item === "object"
			&& Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId));
		if (current === undefined || typeof current.workspaceId !== "string" || current.workspaceId === "") return undefined;
		return current.workspaceId;
	}

	/**
	* 读当前会话的工作目录，新会话照它落位。
	* 读不到就返回 undefined（交给 create 用默认目录）——这不是错误，所以不抛。
	*
	* @param sessions - 会话服务。
	* @param sessionId - 当前会话。
	* @returns 工作目录，或 undefined。
	*/
	function currentCwd(sessions, sessionId) {
		if (sessions.list === undefined || sessions.list === null || typeof sessions.list.getSnapshot !== "function") return undefined;
		const snapshot = sessions.list.getSnapshot();
		const summary = snapshot === undefined || snapshot === null || snapshot.byId === undefined ? undefined : snapshot.byId[sessionId];
		return summary === undefined || summary === null ? undefined : summary.cwd;
	}

	/**
	* 把文本写进目标会话的输入框，等到它真的落定。
	*
	* 新建出来的会话，输入框不是立刻就在的（要先挂载），所以这里轮询；
	* 轮询到期仍写不进去就抛错——静默失败会让用户以为"已经带过去了"。
	*
	* @param ctx - 插件上下文。
	* @param sessionId - 目标会话。
	* @param text - 要写进草稿的文本。
	* @returns 写入成功时以 sessionId 结算。
	*/
	function fillDraft(ctx, sessionId, text) {
		return new Promise((resolve, reject) => {
			let attempts = 0;
			const attempt = () => {
				let shell;
				try {
					shell = composerShell(ctx, sessionId);
				} catch (error) {
					reject(error);
					return;
				}
				if (shell !== undefined && shell !== null) {
					const actions = shell.actions;
					const setDraft = actions !== undefined && actions !== null && typeof actions.setDraft === "function"
						? (value) => actions.setDraft(value)
						: typeof shell.setDraft === "function" ? (value) => shell.setDraft(value) : undefined;
					if (setDraft !== undefined) {
						try {
							setDraft(text);
						} catch (error) {
							reject(error);
							return;
						}
						let draft;
						try {
							draft = shell.state.getSnapshot().draft;
						} catch {
							// 读不到状态就按写入成功算：setDraft 已经调用过了。
							draft = undefined;
						}
						if (draft === undefined || draft === text) {
							resolve(sessionId);
							return;
						}
					}
				}
				attempts += 1;
				if (attempts > NEW_SESSION_WAIT_TRIES) {
					reject(new Error("新会话的输入框一直没准备好，交接内容没能带过去"));
					return;
				}
				window.setTimeout(attempt, NEW_SESSION_WAIT_MS);
			};
			attempt();
		});
	}

	/**
	* sessionId → { actions, turn }：建议**按轮次绑定**。
	*
	* 旧实现只按会话存"最近一组"，而 `turnTail` 在**每一轮**都会渲染一次，
	* 于是同一组建议会挂在会话里所有轮次的尾部——用户看到的就是"同一条预测
	* 消息反复出现"。现在记下产生建议的那一轮，只有那一轮画按钮。
	*/
	const suggestions = new Map();

	/** callId → turn：工具卡片在 start 阶段能拿到 turn，result 阶段拿不到，先记下来。 */
	const callTurns = new Map();

	/** sessionId → 已经见过的最新轮次；只有最新一轮才展示按钮。 */
	const newestTurns = new Map();
	/** sessionId → 监听器集合；最新轮次变化时通知各展示器重画。 */
	const turnListeners = new Map();

	/**
	* 订阅"这个会话的最新轮次变了"。
	*
	* @param sessionId - 目标会话。
	* @param listener - 轮次变化时的回调。
	* @returns 取消订阅函数。
	*/
	function subscribeTurns(sessionId, listener) {
		if (sessionId === "") return () => {};
		let listeners = turnListeners.get(sessionId);
		if (listeners === undefined) {
			listeners = new Set();
			turnListeners.set(sessionId, listeners);
		}
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}

	/**
	* 展示器挂载时上报自己的轮次；出现更新的一轮就通知所有展示器。
	*
	* @param sessionId - 目标会话。
	* @param turn - 展示器所属轮次。
	*/
	function noteTurn(sessionId, turn) {
		if (sessionId === "" || typeof turn !== "number") return;
		const current = newestTurns.get(sessionId);
		if (current !== undefined && current >= turn) return;
		newestTurns.set(sessionId, turn);
		const listeners = turnListeners.get(sessionId);
		if (listeners === undefined) return;
		for (const listener of listeners) listener();
	}

	/**
	* 采集组件在渲染时调用：把这一轮的建议记下来。
	*
	* 拿不到轮次就不记：宁可不显示，也不能让同一组建议到处重复。
	*
	* @param sessionId - 目标会话。
	* @param actions - host 交回来的建议列表。
	* @param turn - 产生这组建议的轮次。
	*/
	function remember(sessionId, actions, turn) {
		if (typeof sessionId !== "string" || sessionId === "" || actions.length === 0) return;
		if (typeof turn !== "number") return;
		const previous = suggestions.get(sessionId);
		if (previous !== undefined && previous.turn === turn && JSON.stringify(previous.actions) === JSON.stringify(actions)) return;
		suggestions.set(sessionId, { actions, turn });
	}

	/**
	* 用户点了建议：这条已经用掉，立刻收起。
	*
	* @param sessionId - 目标会话。
	*/
	function consume(sessionId) {
		suggestions.delete(sessionId);
	}

	/**
	* 读出**这一轮**的建议。
	*
	* 两个条件缺一不可：建议是这一轮产生的；这一轮仍然是会话里最新的一轮
	* （用户已经进入下一轮时，旧建议不再展示）。
	*
	* @param sessionId - 目标会话。
	* @param turn - 当前轮次。
	* @returns 建议列表；不属于这一轮时为空。
	*/
	function take(sessionId, turn) {
		const entry = suggestions.get(sessionId);
		if (entry === undefined) return [];
		if (typeof turn !== "number" || entry.turn !== turn) return [];
		const newest = newestTurns.get(sessionId);
		if (newest !== undefined && newest > entry.turn) return [];
		return entry.actions;
	}
	/**
	* 点击逻辑：防连点 + 分发。
	*
	* 两条路：
	*   - 普通建议 —— 把句子作为用户消息发在当前会话（`sendAsUser`）。
	*   - `opensNewSession` —— 新建会话、切过去、把文本放进那边的草稿。
	*
	* 两条路的失败都要让人看见：只往控制台写一句，用户会以为已经生效了。
	*
	* @param React - 官方 React。
	* @param ctx - 插件上下文。
	* @param sessionId - 当前会话。
	* @param onPicked - 点中一条之后的回调（用来收起这组按钮）。
	* @returns [进行中, 点击处理, 填入输入框, 失败文案]。
	*/
	function usePicker(React, ctx, sessionId, onPicked) {
		const [pending, setPending] = React.useState(false);
		const [failure, setFailure] = React.useState("");
		const busy = React.useRef(false);
		const settle = () => {
			busy.current = false;
			setPending(false);
		};
		const pick = (item) => {
			if (busy.current || sessionId === "") return;
			busy.current = true;
			setPending(true);
			setFailure("");
			if (typeof onPicked === "function") onPicked();
			const text = actionText(item);
			if (item.opensNewSession === true) {
				openNewSession(ctx, sessionId, text).then(settle, (error) => {
					console.error("[dsh-suggest-actions] open new session failed:", error);
					setFailure(errorMessage(error));
					settle();
				});
				return;
			}
			try {
				sendAsUser(ctx, sessionId, text);
			} catch (error) {
				console.error("[dsh-suggest-actions] send failed:", error);
				setFailure(errorMessage(error));
			}
			window.setTimeout(settle, 900);
		};
		const fill = (item) => {
			if (sessionId === "") return;
			try {
				fillComposer(ctx, sessionId, actionText(item));
				setFailure("");
			} catch (error) {
				console.error("[dsh-suggest-actions] fill composer failed:", error);
				setFailure(errorMessage(error));
			}
		};
		return [pending, pick, fill, failure];
	}

	/** 失败的文案：说清哪儿错了，别只给个"出错了"。 */
	function errorMessage(error) {
		if (error !== null && typeof error === "object" && typeof error.message === "string" && error.message !== "") {
			return error.message;
		}
		return String(error);
	}

	/** 采集器：挂在工具卡片上，只记数据，不画东西。 */
	function createCapture(React, ctx) {
		return function SuggestActionsCapture(props) {
			const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
			const callId = typeof props.callId === "string" ? props.callId : "";
			const block = props.block;
			// start 阶段（ToolCallHead）带 turn；result 阶段（ToolResultNode）不带，靠 callId 找回。
			if (callId !== "" && block !== null && typeof block === "object" && typeof block.turn === "number") {
				callTurns.set(callId, block.turn);
			}
			const turn = callId === "" ? undefined : callTurns.get(callId);
			// 兜底：start 阶段若被 React 合批掉（同一帧里 start+result），按"当前最新轮次 + 1"算——
			// 结果帧到达时，本轮的尾部还没挂载，最新挂载的一定是上一轮。
			const fallbackTurn = typeof turn === "number" ? turn : (newestTurns.get(sessionId) ?? 0) + 1;
			// 规则只有一份，在 host：这里只把 host 交回来的列表记下来。
			remember(sessionId, readHostActions(block), fallbackTurn);
			return null;
		};
	}

	/**
	 * 默认直接露出几条，其余折叠起来。
	 *
	 * 2026-09-30 从 3 改成 5：单轮上限本来就是 5（立场五档各一条），阈值设成 3
	 * 会让界面上永远只有 3 个按钮、多出来的要点一下才看得见——用户连着两轮
	 * 反馈"最多只能看到 3 个"。设成 5 等于默认铺开；折叠这段逻辑留着，给
	 * 以后上限被调高（配置到 6）时用。
	 */
	const VISIBLE_ACTIONS = 5;

	/** 新会话的输入框要等它挂载：最多等 40 × 100ms = 4 秒。 */
	const NEW_SESSION_WAIT_TRIES = 40;
	const NEW_SESSION_WAIT_MS = 100;

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
			? { recommended: "推荐", newSession: "新会话", failed: "没能带过去：", more: (n) => `还有 ${n} 条`, less: "收起", fillHint: "填入输入框，改完再发" }
			: { recommended: "Recommended", newSession: "New session", failed: "Could not carry it over: ", more: (n) => `${n} more`, less: "Show less", fillHint: "Put in the message box to edit before sending" };
	}

	/**
	 * 一条建议：按钮 + 悬停展开的全文。
	 *
	 * 全文**放在按钮外面**（做按钮的兄弟节点）：一是不参与按钮宽度计算，二展开之后
	 * 点它不会误发——它原先长在按钮里，想选中文字复制一下都会点出去。
	 */
	function actionItem(React, item, key, pending, pick, fill, text) {
		// 只有确实比标签更长、内容也不同的 prompt 才值得展开；缺省时发送的就是 label 本身。
		const full = typeof item.prompt === "string" && item.prompt !== "" && item.prompt !== item.label
			? item.prompt
			: undefined;
		return React.createElement("div", {
			key,
			className: "dsh-suggest-item"
		}, React.createElement("div", {
			className: "dsh-suggest-line"
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
		}, item.label), item.opensNewSession === true ? React.createElement("span", {
			className: "dsh-suggest-tag"
		}, text.newSession) : null, item.recommended === true ? React.createElement("span", {
			className: "dsh-suggest-rec"
		}, text.recommended) : null, React.createElement("span", {
			className: "dsh-suggest-arrow",
			"aria-hidden": "true"
		}, "\u2192"))), React.createElement("button", {
			type: "button",
			className: "dsh-suggest-fill",
			title: text.fillHint,
			"aria-label": text.fillHint,
			disabled: pending,
			onClick: () => fill(item)
		}, fillIcon(React))), full === undefined ? null : React.createElement("span", {
			className: "dsh-suggest-full"
		}, full));
	}

	/** 展示器：挂在轮次尾部，画按钮；超过 VISIBLE_ACTIONS 条就折叠，展开状态不记忆。 */
	function createTail(React, ctx) {
		return function SuggestActionsTail(props) {
			const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
			const turn = typeof props.turn === "number" ? props.turn : undefined;
			const [, setRevision] = React.useState(0);
			// 展开状态**故意不记忆**：组件重新挂载（滚动、切会话回来）就回到收起，
			// 否则历史轮次会把"还有 N 条"全撑开，屏幕很快失控。
			const [expanded, setExpanded] = React.useState(false);
			React.useEffect(() => {
				if (sessionId === "") return undefined;
				const bump = () => setRevision((value) => value + 1);
				const off = subscribeTurns(sessionId, bump);
				noteTurn(sessionId, turn);
				// 采集器可能比这里晚一拍（同在轮次尾部视图里渲染），挂载后补读一次。
				const timer = window.setTimeout(bump, 0);
				return () => {
					off();
					window.clearTimeout(timer);
				};
			}, [sessionId, turn]);
			const [pending, pick, fill, failure] = usePicker(React, ctx, sessionId, () => {
				consume(sessionId);
				setRevision((value) => value + 1);
			});
			const items = take(sessionId, turn);
			if (items.length === 0) return null;
			const text = uiStrings();
			const overflow = items.length > VISIBLE_ACTIONS;
			const visible = expanded || !overflow ? items : items.slice(0, VISIBLE_ACTIONS);
			const children = visible.map((item, index) => actionItem(React, item, `a${index}`, pending, pick, fill, text));
			if (failure !== "") children.push(React.createElement("div", {
				key: "failure",
				className: "dsh-suggest-error"
			}, `${text.failed}${failure}`));
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
