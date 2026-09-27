/**
 * 建议列表的清洗 —— host 侧与测试共用。
 *
 * 注意：`lib/client.js` 里有一份等价的解析实现（客户端 bundle 必须自包含，
 * 不能 import 这个文件）。改这里的行为时那边要同步，`test/sync.test.mjs`
 * 会拿同一批输入比对两边结果是否一致。
 */

/**
 * 一条建议的"立场"，两条轴：
 *
 *   力度轴 —— `cautious`（更小步、先验证） / `standard`（常规推进） / `bold`（更用力、更快、更敢冒险）
 *   方向轴 —— `alternative`（换一条路；当前做法走不通时用它，它不是"更激进的同一条路"）
 *   终止   —— `stop`（这事可以不做）
 *
 * 为什么要有这个字段：只靠"告诉模型要给不同角度的建议"没有约束力
 * （规则写成自觉就等于没有）。做成必填枚举 + 同档去重之后，
 * "三条其实是同一条路的三种说法"在格式上就发生不了。
 */
const ANGLES = ["standard", "bold", "cautious", "alternative", "stop"];

/** 一次最多给几条建议；超过就丢，防模型塞一大串。 */
const DEFAULT_MAX = 3;
const HARD_MAX = 6;

/**
 * 把模型给的 actions 洗成可用的建议列表。
 *
 * 处理这些脏输入：非数组、元素不是对象、label 缺失/纯空白、label 里的换行与
 * 连续空格、重复的 label、重复的立场、非法的立场值、超出上限的条数。
 *
 * 顺序：先把全部输入过完筛，再排序，最后才按上限截断。**不能边筛边截** ——
 * 那样排在后面的推荐项会先被上限丢掉，"推荐的置顶"就白定了。
 *
 * @param input - 工具参数里的 actions（类型未知）。
 * @param maxActions - 最多保留几条；非法值退回默认 3，并夹在 1..6。
 * @returns 清洗后的列表，每项 `{ angle?, label, prompt?, recommended?, opensNewSession? }`。
 */
export function normalizeActions(input, maxActions = DEFAULT_MAX) {
	if (!Array.isArray(input)) return [];
	const limit = Number.isFinite(maxActions)
		? Math.max(1, Math.min(HARD_MAX, Math.trunc(maxActions)))
		: DEFAULT_MAX;
	const collected = [];
	const seenLabels = new Set();
	const seenAngles = new Set();
	// 「另开新会话」这类动作，一个会话只要一个：出现第二个就丢掉，免得点哪个都一样。
	let seenNewSession = false;
	for (const item of input) {
		if (item === null || typeof item !== "object") continue;
		const label = typeof item.label === "string" ? item.label.replace(/\s+/g, " ").trim() : "";
		if (label === "") continue;
		const labelKey = label.toLowerCase();
		if (seenLabels.has(labelKey)) continue;
		// 立场：只认枚举内的值；同一档只留第一条。
		const angle = typeof item.angle === "string" && ANGLES.includes(item.angle) ? item.angle : undefined;
		if (angle !== undefined) {
			if (seenAngles.has(angle)) continue;
			seenAngles.add(angle);
		}
		seenLabels.add(labelKey);
		const prompt = typeof item.prompt === "string" && item.prompt.trim() !== ""
			? item.prompt.trim()
			: undefined;
		// 推荐是显式标记，不绑定位置：模型认为哪条最该做就标哪条，认为"都行"就一个都不标。
		const recommended = item.recommended === true ? true : undefined;
		// 只有显式 true 才算；第二个同类的丢掉（见上面 seenNewSession）。
		const opensNewSession = item.opensNewSession === true ? true : undefined;
		if (opensNewSession === true) {
			if (seenNewSession) continue;
			seenNewSession = true;
		}
		collected.push({
			...(angle === undefined ? {} : { angle }),
			...(recommended === undefined ? {} : { recommended }),
			...(opensNewSession === undefined ? {} : { opensNewSession }),
			label,
			...(prompt === undefined ? {} : { prompt })
		});
	}
	return orderActions(collected).slice(0, limit);
}

/**
 * 排序：推荐的置顶、"可以不做"垫底，其余保持原顺序。
 *
 * 一条同时标着推荐和 `stop` 时按推荐处理 —— 显式标记比立场更可信，
 * 而且"最该先做"和"这事可以不做"本来就自相矛盾，让模型自己难看去。
 *
 * @param items - 已过筛的建议列表。
 * @returns 排好序的新数组（不改动入参）。
 */
function orderActions(items) {
	const recommendedItems = [];
	const middle = [];
	const stopItems = [];
	for (const item of items) {
		if (item.recommended === true) recommendedItems.push(item);
		else if (item.angle === "stop") stopItems.push(item);
		else middle.push(item);
	}
	return [...recommendedItems, ...middle, ...stopItems];
}

export { ANGLES, DEFAULT_MAX, HARD_MAX };
