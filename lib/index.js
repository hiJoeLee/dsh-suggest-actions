/**
 * dsh-suggest-actions —— Host 侧。
 *
 * 只做一件事：注册 `suggest_actions` 工具。它不阻塞、不等人——模型调用它，
 * 参数里带 2-3 条建议，工具立刻返回，这一轮正常结束。真正把建议画成按钮
 * 的是客户端插件（lib/client.js），它按工具名接管这张卡片、再交给轮次尾部渲染。
 *
 * 为什么不用官方的 ask_user_question：那个的语义是"提问等回答"，会把整轮
 * 挂起；建议按钮要的是"顺带给几个下一步"，不打断这一轮。
 *
 * 参数清洗在 `lib/normalize.js`（纯函数、可单测），这里只负责接线与配置。
 */
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { ANGLES, normalizeActions } from "./normalize.js";

const name = "dsh-suggest-actions";

/** 只依赖工具注册表；不碰会话、不碰用户问答。 */
const inject = ["tools"];

/**
 * 插件配置。写在 profile 的 `cordis.patch.yml` 里本插件那一行的 `config` 下：
 *
 * ```yaml
 * - id: suggest-actions
 *   name: 'dsh-suggest-actions'
 *   config:
 *     maxActions: 3
 * ```
 */
const Config = Schema.object({
	maxActions: Schema.number().default(3).description("单次最多显示几条建议（1–6），超出的丢弃。")
});

const description = [
	"Show the user 2-3 clickable next-step suggestions right under your reply.",
	"Clicking one sends its text as the user's next message, so write each one the way the user would actually say it.",
	"Always mark exactly one entry with `recommended: true` — the one you would do first. Where you put it in the list does not matter: it is moved to the top for you, and a `stop` entry is always pushed to the bottom. Among the rest the order you give is kept, so put the more useful ones earlier. Omitting the mark should be rare, only when the options are genuinely interchangeable — there is almost always a sensible first move.",
	"Two axes; at most one suggestion per stance, a repeated stance is dropped.",
	"Effort axis — `cautious` (smaller step, verify first) / `standard` (the sensible move) / `bold` (the same route pushed harder: it still assumes the current approach continues).",
	"Direction axis — `alternative` (a different route: it means giving up the current approach, not pushing it harder).",
	"`stop` — this need not be done at all.",
	"Prefer two over three: default to two, give three only when there really are three distinct moves, and one is fine when there is only one way forward.",
	"Judge a stuck problem by the problem itself, not by how a message was typed — a clicked suggestion and a typed one look identical in the transcript. If the same problem has not moved across two turns, consider `alternative`; but when the user is clearly going deeper on one approach, do not interrupt them with a change of direction.",
	"Phrase each button as the action it performs (\"先查一下 X 再决定\"), not as a final verdict (\"就改成 Y\") — the user should still be able to change their mind after clicking.",
	"Set `opensNewSession: true` on a suggestion when clicking it should open a NEW session in the same workspace and carry that suggestion's `prompt` over as the new session's draft, instead of sending it here. Use it when the session has grown long and continuing in a fresh one is the point — put the handoff brief (conclusions, what is done, what is next, key files) in `prompt`. It never auto-sends, and only one such entry is kept.",
	"This never waits for an answer: it returns immediately and your turn ends normally."
].join(" ");

function apply(ctx, config) {
	const maxActions = config?.maxActions ?? 3;
	ctx.tools.register(defineTool({
		name: "suggest_actions",
		description,
		parameters: { actions: {
			type: "array",
			required: true,
			description: "Suggestions rendered as buttons under the reply. The order you give is kept among the unmarked ones; the recommended entry is moved to the top and a `stop` entry to the bottom.",
			items: {
				type: "object",
				additionalProperties: true,
				properties: {
					angle: {
						type: "string",
						required: true,
						enum: [...ANGLES],
						description: "Which stance this suggestion takes. cautious = smaller step, verify first; "
							+ "standard = the sensible next move; bold = the same route pushed harder (still assumes the current approach continues); "
							+ "alternative = a different route, meaning the current approach is given up; "
							+ "stop = it is fine to not do this at all. Never repeat a stance."
					},
					label: {
						type: "string",
						required: true,
						description: "Button text the user reads. Short and concrete, e.g. \"帮我提交并重启服务\"."
					},
					prompt: {
						type: "string",
						description: "Text sent as the user's message when clicked. Defaults to the label."
					},
					recommended: {
						type: "boolean",
						description: "Set true on the single suggestion you actually recommend. Omit it when they are equally good."
					},
					opensNewSession: {
						type: "boolean",
						description: "Set true to open a NEW session in the same workspace and carry this entry's `prompt` over as that session's draft instead of sending it here. At most one such entry is kept."
					}
				}
			}
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { shown: {
					type: "boolean",
					required: true
				} }
			},
			render: (args, value) => [{
				type: "text",
				text: value.shown
					? "Suggestions are visible to the user under your reply."
					: "No suggestions were shown: every entry was missing a usable label."
			}, {
				// 这一段是给客户端读的：客户端 bundle 拿不到插件配置（maxActions），
				// 上限和顺序只能从这里取。用户看不见它——工具卡片被客户端的采集组件接管了。
				// 列表在这里重算一次（execute 里那次只用来判断 shown），纯函数、开销可忽略；
				// 这样也不用往 output 的 schema 里加字段，少一处会校验失败的地方。
				type: "text",
				text: JSON.stringify({ actions: normalizeActions(args.actions, maxActions) })
			}]
		},
		async execute(args) {
			// 清洗、去重、排序、截断全在 normalizeActions 里定；界面照抄 run 出来那一份。
			return { shown: normalizeActions(args.actions, maxActions).length > 0 };
		}
	}));
}

export { Config, apply, inject, name };
