/**
 * parseActions 的直接单测（`lib/parse.js`）。
 *
 * 这里测的是"从 block 里取出参数"这一段；纯清洗规则在 normalize.test.mjs，
 * 两份实现是否一致在 sync.test.mjs。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseActions } from "../lib/parse.js";

const wrap = (actions) => ({ kind: "tool-call", call: { argsRaw: JSON.stringify({ actions }) } });

test("已落定形状：从 block.call.argsRaw 取参数", () => {
	assert.deepEqual(parseActions(wrap([{ label: "A" }, { label: "B" }])), [{ label: "A" }, { label: "B" }]);
});

test("未落定形状：从 block.argsRaw 取参数", () => {
	assert.deepEqual(parseActions({ argsRaw: JSON.stringify({ actions: [{ label: "A" }] }) }), [{ label: "A" }]);
});

test("block 为 undefined / null 返回空", () => {
	assert.deepEqual(parseActions(undefined), []);
	assert.deepEqual(parseActions(null), []);
});

test("argsRaw 缺失或为空返回空", () => {
	assert.deepEqual(parseActions({ kind: "x", call: {} }), []);
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: "" } }), []);
});

test("argsRaw 不是字符串返回空", () => {
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: 123 } }), []);
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: null } }), []);
});

test("坏 JSON 静默返回空（不抛）", () => {
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: "{oops" } }), []);
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: "" } }), []);
});

test("JSON 合法但不是对象 / actions 不是数组 → 空", () => {
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: "42" } }), []);
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: '"str"' } }), []);
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: "[1,2]" } }), []);
	assert.deepEqual(parseActions({ kind: "x", call: { argsRaw: JSON.stringify({ actions: "no" }) } }), []);
});

test("默认最多 3 条", () => {
	const many = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}` }));
	assert.equal(parseActions(wrap(many)).length, 3);
});

test("可以传入更小的上限", () => {
	const many = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}` }));
	assert.equal(parseActions(wrap(many), 1).length, 1);
	assert.equal(parseActions(wrap(many), 6).length, 6);
});
