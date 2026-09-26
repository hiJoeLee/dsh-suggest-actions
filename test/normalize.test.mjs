/**
 * normalizeActions 的单测 —— 覆盖它能遇到的所有脏输入。
 * 跑：node --test test/   （或 pnpm test）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeActions } from "../lib/normalize.js";

test("正常输入：原样保留，顺序不变", () => {
	assert.deepEqual(
		normalizeActions([{ label: "好的，提交吧", prompt: "好的，提交吧" }, { label: "先别提交" }], 3),
		[{ label: "好的，提交吧", prompt: "好的，提交吧" }, { label: "先别提交" }]
	);
});

test("非数组（undefined / null / 字符串 / 对象）一律返回空", () => {
	for (const bad of [undefined, null, "abc", 42, { label: "x" }]) {
		assert.deepEqual(normalizeActions(bad, 3), [], `输入 ${JSON.stringify(bad)} 应为空`);
	}
});

test("跳过坏元素：null、数字、字符串、布尔", () => {
	assert.deepEqual(
		normalizeActions([null, 1, "x", true, { label: "留下" }], 3),
		[{ label: "留下" }]
	);
});

test("label 缺失、非字符串、纯空白都跳过", () => {
	assert.deepEqual(
		normalizeActions([{}, { label: 42 }, { label: "   " }, { label: "\n\t" }, { label: "有效" }], 3),
		[{ label: "有效" }]
	);
});

test("label 里的换行与连续空格压成单个空格", () => {
	assert.deepEqual(
		normalizeActions([{ label: "  帮我   提交\n并重启  " }], 3),
		[{ label: "帮我 提交 并重启" }]
	);
});

test("label 去重（忽略大小写），保留先出现的那个", () => {
	assert.deepEqual(
		normalizeActions([{ label: "Restart" }, { label: "restart" }, { label: "别的" }], 5),
		[{ label: "Restart" }, { label: "别的" }]
	);
});

test("超出 maxActions 的尾部被截断", () => {
	const many = Array.from({ length: 10 }, (_, i) => ({ label: `第 ${i + 1} 条` }));
	assert.equal(normalizeActions(many, 3).length, 3);
	assert.deepEqual(normalizeActions(many, 3).map((a) => a.label), ["第 1 条", "第 2 条", "第 3 条"]);
});

test("截断发生在去重之后：坏元素不占额度", () => {
	assert.deepEqual(
		normalizeActions([null, { label: " " }, { label: "A" }, { label: "B" }], 2),
		[{ label: "A" }, { label: "B" }]
	);
});

test("maxActions 非法或越界时夹到 1..6", () => {
	const many = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` }));
	assert.equal(normalizeActions(many, 0).length, 1, "0 → 夹到 1");
	assert.equal(normalizeActions(many, -5).length, 1, "负数 → 夹到 1");
	assert.equal(normalizeActions(many, 99).length, 6, "99 → 夹到 6");
	assert.equal(normalizeActions(many, 2.7).length, 2, "小数 → 向下取整");
	assert.equal(normalizeActions(many, Number.NaN).length, 3, "NaN → 默认 3");
	assert.equal(normalizeActions(many, undefined).length, 3, "未给 → 默认 3");
});

test("prompt 为空白视为未给，整项只剩 label", () => {
	assert.deepEqual(
		normalizeActions([{ label: "A", prompt: "   " }, { label: "B", prompt: " 去提交 " }], 3),
		[{ label: "A" }, { label: "B", prompt: "去提交" }]
	);
});

test("prompt 缺省与显式给的区分：缺省时不带 prompt 字段", () => {
	const [onlyLabel] = normalizeActions([{ label: "只有标签" }], 1);
	assert.equal(Object.hasOwn(onlyLabel, "prompt"), false);
});
