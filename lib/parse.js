/**
 * 卡片数据 → 建议列表（纯函数，供单测与一致性检查）。
 *
 * ⚠️ `lib/client.js` 里有一份**逐字等价**的内联实现 —— 客户端 bundle 必须自包含，
 * 不能 import 本文件。两份实现由 `test/sync.test.mjs` 用同一批输入逐个比对，
 * 任何一边漂移都会让测试挂掉。改这里就必须改那边。
 *
 * 与 host 侧 `lib/normalize.js` 的关系：清洗规则相同（空白、去重、上限），
 * 只是入口不同 —— 那边收的是已经解析好的数组，这边还要先从 argsRaw 解析。
 */

/** 一次最多保留几条（与 host 的默认值对齐）。 */
const MAX_ACTIONS = 3;

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

export { parseActions, MAX_ACTIONS };
