/**
 * dsh-suggest-actions —— Host 侧。
 *
 * 只做一件事：注册 `suggest_actions` 工具。它不阻塞、不等人——模型调用它，
 * 参数里带 2-3 条建议，工具立刻返回，这一轮正常结束。真正把建议画成按钮
 * 的是客户端插件（lib/client.js），它按工具名接管这张卡片。
 *
 * 为什么不用官方的 ask_user_question：那个的语义是"提问等回答"，会把整轮
 * 挂起；建议按钮要的是"顺带给几个下一步"，不打断这一轮。
 */
import { defineTool } from "@deepseek-ai/dsh-tools";

const name = "dsh-suggest-actions";

/** 只依赖工具注册表；不碰会话、不碰用户问答。 */
const inject = ["tools"];

const description = [
	"Show the user 2-3 clickable next-step suggestions right under your reply.",
	"Clicking one sends its text as the user's next message, so write each one the way the user would actually say it.",
	"This never waits for an answer: it returns immediately and your turn ends normally.",
	"Use it to close a turn by offering concrete next moves instead of asking an open question."
].join(" ");

function apply(ctx) {
	ctx.tools.register(defineTool({
		name: "suggest_actions",
		description,
		parameters: { actions: {
			type: "array",
			required: true,
			description: "Suggestions rendered as buttons under the reply. Put the one you recommend first.",
			items: {
				type: "object",
				additionalProperties: true,
				properties: {
					label: {
						type: "string",
						required: true,
						description: "Button text the user reads. Short and concrete, e.g. \"帮我提交并重启服务\"."
					},
					prompt: {
						type: "string",
						description: "Text sent as the user's message when clicked. Defaults to the label."
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
			render: (_args, value) => [{
				type: "text",
				text: value.shown
					? "Suggestions are visible to the user under your reply."
					: "No suggestions were shown: every entry was missing a label."
			}]
		},
		async execute(args) {
			const actions = Array.isArray(args.actions) ? args.actions : [];
			const shown = actions.some((action) => action !== null
				&& typeof action === "object"
				&& typeof action.label === "string"
				&& action.label.trim() !== "");
			return { shown };
		}
	}));
}

export { apply, inject, name };
