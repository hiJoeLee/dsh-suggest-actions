/**
 * 建议按钮「按轮次绑定」的单测 —— 直接加载 lib/client.js，用迷你 React 驱动真实组件。
 * 跑：node --test test/
 *
 * 为什么要有这组用例：0.1.16 及以前，建议只按会话存一份"最近一组"，而
 * `conversation.chat.turnTail` 在**每一轮**都会渲染一次，`take(sessionId)` 无条件
 * 返回同一份数据 —— 结果同一组按钮挂在会话里每一轮的尾部，点过也不消失。
 * 这里锁住修复后的四条行为：只在本轮显示、更新的一轮出现后收起、点过即收、
 * start 阶段缺失时按"最新轮次 + 1"兜底。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../lib/client.js"), "utf8");

/** 迷你 React：只实现 client.js 用到的那几个 Hook，够把组件跑起来。 */
function makeReact() {
	const R = {
		createElement(type, props, ...children) {
			return { type, props: props ?? {}, children };
		},
		useState(init) {
			const i = R.__idx++;
			if (!(i in R.__state)) R.__state[i] = typeof init === "function" ? init() : init;
			const set = (value) => {
				const next = typeof value === "function" ? value(R.__state[i]) : value;
				if (next !== R.__state[i]) {
					R.__state[i] = next;
					R.__dirty = true;
				}
			};
			return [R.__state[i], set];
		},
		useReducer(reducer, init) {
			const i = R.__idx++;
			if (!(i in R.__state)) R.__state[i] = init;
			const dispatch = (action) => {
				const next = reducer(R.__state[i], action);
				if (next !== R.__state[i]) {
					R.__state[i] = next;
					R.__dirty = true;
				}
			};
			return [R.__state[i], dispatch];
		},
		useRef(value) {
			const i = R.__idx++;
			if (!(i in R.__state)) R.__state[i] = { current: value };
			return R.__state[i];
		},
		useEffect(fn, deps) {
			R.__effects.push({ i: R.__idx++, fn, deps });
		},
		__state: [],
		__idx: 0,
		__effects: [],
		__dirty: false,
	};
	return R;
}

/** 一个组件实例：render 会一直跑到没有新的 setState 为止，并执行 effect。 */
function mount(Component, R) {
	const instance = {
		props: undefined,
		render(props) {
			instance.props = props;
			let guard = 0;
			let output;
			do {
				R.__dirty = false;
				R.__idx = 0;
				R.__effects = [];
				output = Component(props);
				for (const effect of R.__effects) {
					const previous = R.__state[effect.i];
					const same = previous !== undefined && previous.deps !== undefined && effect.deps !== undefined
						&& previous.deps.length === effect.deps.length
						&& previous.deps.every((dep, at) => dep === effect.deps[at]);
					if (same) continue;
					if (typeof previous?.cleanup === "function") previous.cleanup();
					R.__state[effect.i] = { deps: effect.deps, cleanup: effect.fn() };
				}
				guard += 1;
			} while (R.__dirty && guard < 10);
			return output;
		},
		rerender() {
			return instance.render(instance.props);
		},
	};
	return instance;
}

/** 加载一份全新的插件（模块级 Map 会随 IIFE 重新初始化），取出两个组件。 */
function loadPlugin() {
	let definition;
	const fakeDocument = {
		documentElement: { lang: "zh-CN" },
		createElement: () => ({ textContent: "" }),
		head: { appendChild() {} },
	};
	const fakeWindow = {
		navigator: { language: "zh-CN" },
		setTimeout: (fn, ms) => setTimeout(fn, ms),
		clearTimeout: (id) => clearTimeout(id),
		__ModuleLoader__: { load: (value) => { definition = value; } },
	};
	new Function("window", "document", "navigator", source)(fakeWindow, fakeDocument, fakeWindow.navigator);

	const R = makeReact();
	const plugin = definition.factory((name) => {
		if (name === "react") return R;
		throw new Error(`意外的 require: ${name}`);
	});
	const slots = {};
	plugin.apply({
		get: () => undefined,
		slots: {
			inject: (_name, register) => register(),
			register: (spec, component) => { slots[spec.name] = component; },
		},
	});
	return {
		R,
		capture: slots["tool.call.toolview"],
		tail: slots["conversation.chat.turnTail"],
	};
}

const actions = [
	{ angle: "standard", label: "先做切片统一", prompt: "按 A 方案动手" },
	{ angle: "bold", label: "一起做内存看护" },
];

/** host 交回来的工具结果：文本里是一段 { actions } JSON。 */
const resultBlock = {
	kind: "tool-result",
	content: [{ type: "text", text: JSON.stringify({ actions }) }],
};

function feed(plugin, sessionId, callId, turn) {
	const capture = mount(plugin.capture, plugin.R);
	// start 阶段：block 是 ToolCallHead，带 turn
	capture.render({ sessionId, callId, phase: "start", block: { phase: "start", turn, name: "suggest_actions" } });
	// result 阶段：block 是 ToolResultNode，不带 turn
	capture.render({ sessionId, callId, phase: "result", block: resultBlock });
}

test("只有产生建议的那一轮显示按钮", () => {
	const plugin = loadPlugin();
	feed(plugin, "s1", "c1", 3);
	const turn3 = mount(plugin.tail, plugin.R).render({ sessionId: "s1", turn: 3 });
	const turn2 = mount(plugin.tail, plugin.R).render({ sessionId: "s1", turn: 2 });
	assert.notEqual(turn3, null, "第 3 轮应显示按钮");
	assert.equal(turn2, null, "第 2 轮不该显示同一组按钮");
});

test("出现更新的一轮后，旧按钮收起", () => {
	const plugin = loadPlugin();
	feed(plugin, "s1", "c1", 3);
	const tail3 = mount(plugin.tail, plugin.R);
	assert.notEqual(tail3.render({ sessionId: "s1", turn: 3 }), null);
	const turn4 = mount(plugin.tail, plugin.R).render({ sessionId: "s1", turn: 4 });
	assert.equal(turn4, null, "第 4 轮没有建议，不该显示");
	assert.equal(tail3.rerender(), null, "进入第 4 轮后，第 3 轮的按钮应收起");
});

test("点击建议后按钮立即收起", () => {
	const plugin = loadPlugin();
	feed(plugin, "s1", "c1", 5);
	const tail = mount(plugin.tail, plugin.R);
	const tree = tail.render({ sessionId: "s1", turn: 5 });
	assert.notEqual(tree, null);
	const flat = (node) => (Array.isArray(node) ? node.flat(Infinity).filter(Boolean) : node === undefined ? [] : [node]);
	const item = flat(tree.children).find((child) => child?.props?.className === "dsh-suggest-item");
	const button = flat(flat(item.children)[0].children)[0];
	assert.equal(typeof button.props.onClick, "function");
	button.props.onClick();
	assert.equal(tail.rerender(), null, "点过之后这组按钮不该再出现");
});

test("start 阶段缺失时按最新轮次 + 1 兜底", () => {
	const plugin = loadPlugin();
	const R = plugin.R;
	mount(plugin.tail, R).render({ sessionId: "s3", turn: 1 });
	const tail2 = mount(plugin.tail, R);
	tail2.render({ sessionId: "s3", turn: 2 });
	// 只有 result 阶段（start 被合批掉）
	mount(plugin.capture, R).render({ sessionId: "s3", callId: "c9", phase: "result", block: resultBlock });
	const turn3 = mount(plugin.tail, R).render({ sessionId: "s3", turn: 3 });
	assert.notEqual(turn3, null, "应绑定到第 3 轮");
	assert.equal(tail2.rerender(), null, "第 2 轮不该显示");
});

test("没有建议的会话不显示", () => {
	const plugin = loadPlugin();
	const tree = mount(plugin.tail, plugin.R).render({ sessionId: "s2", turn: 1 });
	assert.equal(tree, null);
});
