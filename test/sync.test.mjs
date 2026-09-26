/**
 * 一致性测试：`lib/client.js` 里那份**内联**的 parseActions
 * 必须和 `lib/parse.js` 行为完全相同。
 *
 * 为什么要这么绕：客户端 bundle 必须自包含（host 只登记入口文件，相对 import 取不到），
 * 所以解析逻辑不得不在两边各放一份。这个测试把 client.js 的同步区**抽出来执行**，
 * 再用同一批输入比对两边结果 —— 任何一边漂移，这里立刻红。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseActions as reference } from "../lib/parse.js";

const clientSource = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

/** 抽出 client.js 里 `#region sync:parse-actions` 标记之间的代码，取出 parseActions。 */
function loadInline() {
	const m = clientSource.match(
		/\/\/ #region sync:parse-actions[^\n]*\n([\s\S]*?)\n[\t ]*\/\/ #endregion sync:parse-actions/
	);
	assert.ok(m !== null, "client.js 里找不到同步区标记（// #region sync:parse-actions）");
	return new Function(`${m[1]}\nreturn parseActions;`)();
}

/** 覆盖两种 block 形状与各种脏输入。 */
const BLOCKS = {
	"已落定": { kind: "tool-call", call: { argsRaw: JSON.stringify({ actions: [{ label: "A" }, { label: "B" }] }) } },
	"未落定": { argsRaw: JSON.stringify({ actions: [{ label: "A" }] }) },
	"空参数": { kind: "x", call: { argsRaw: "" } },
	"参数缺失": { kind: "x", call: {} },
	"坏 JSON": { kind: "x", call: { argsRaw: "{oops" } },
	"JSON 不是对象": { kind: "x", call: { argsRaw: "42" } },
	"actions 不是数组": { argsRaw: JSON.stringify({ actions: "no" }) },
	"含脏元素": { argsRaw: JSON.stringify({ actions: [null, 7, { label: "   " }, { label: " A \n B " }, { label: "a  b" }] }) },
	"重复 label": { argsRaw: JSON.stringify({ actions: [{ label: "Same" }, { label: "same" }, { label: "别的" }] }) },
	"超长列表": { argsRaw: JSON.stringify({ actions: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}` })) }) },
	"prompt 空白": { argsRaw: JSON.stringify({ actions: [{ label: "A", prompt: "  " }] }) }
};

test("client 内联实现与 lib/parse.js 在所有用例上一致", () => {
	const inline = loadInline();
	for (const [name, block] of Object.entries(BLOCKS)) {
		for (const max of [undefined, 1, 3, 6, 0, -1, 99, 2.7, Number.NaN]) {
			assert.deepEqual(
				inline(block, max),
				reference(block, max),
				`用例「${name}」在 maxActions=${String(max)} 下两边结果不一致`
			);
		}
	}
});

test("丢块（undefined / null）两边一致", () => {
	const inline = loadInline();
	for (const bad of [undefined, null]) {
		assert.deepEqual(inline(bad), reference(bad));
	}
});
