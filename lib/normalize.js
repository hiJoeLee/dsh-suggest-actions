/**
 * 建议列表的清洗 —— host 侧与测试共用。
 *
 * 注意：`lib/client.js` 里有一份等价的解析实现（客户端 bundle 必须自包含，
 * 不能 import 这个文件）。改这里的行为时那边要同步，`test/sync.test.mjs`
 * 会拿同一批输入比对两边结果是否一致。
 */

/** 一次最多给几条建议；超过就丢，防模型塞一大串。 */
const DEFAULT_MAX = 3;
const HARD_MAX = 6;

/**
 * 把模型给的 actions 洗成可用的建议列表。
 *
 * 处理这些脏输入：非数组、元素不是对象、label 缺失/纯空白、label 里的换行与
 * 连续空格、重复的 label、超出上限的条数。
 *
 * @param input - 工具参数里的 actions（类型未知）。
 * @param maxActions - 最多保留几条；非法值退回默认 3，并夹在 1..6。
 * @returns 清洗后的列表，每项 `{ label, prompt? }`。
 */
export function normalizeActions(input, maxActions = DEFAULT_MAX) {
	if (!Array.isArray(input)) return [];
	const limit = Number.isFinite(maxActions)
		? Math.max(1, Math.min(HARD_MAX, Math.trunc(maxActions)))
		: DEFAULT_MAX;
	const out = [];
	const seen = new Set();
	for (const item of input) {
		if (item === null || typeof item !== "object") continue;
		const label = typeof item.label === "string" ? item.label.replace(/\s+/g, " ").trim() : "";
		if (label === "") continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const prompt = typeof item.prompt === "string" && item.prompt.trim() !== ""
			? item.prompt.trim()
			: undefined;
		out.push(prompt === undefined ? { label } : { label, prompt });
		if (out.length >= limit) break;
	}
	return out;
}

export { DEFAULT_MAX, HARD_MAX };
