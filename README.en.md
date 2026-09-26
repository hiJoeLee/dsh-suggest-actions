# dsh-suggest-actions

Clickable **next-step suggestions** under every reply in DeepSeek Harness. One click sends that text as your message — no typing.

It answers "I've read it, now should it do A or B": instead of composing the sentence yourself, just click it.

## Not the same thing as "composer completion"

There are already a few "next sentence" plugins (`dsh-input-assist`, `dsh-prompt-for-me`, `dsh-suggest-ghost`). They all live **inside the composer** as ghost text: the plugin guesses what you might say, offers one line, you accept with Tab, then **press Enter yourself**.

This one takes a different route:

|  | Composer completion | This plugin |
|---|---|---|
| Where | inside the composer | **under the reply** (turn tail) |
| How many | one | **2-3** |
| Who decides | the plugin guesses | **the model, from context** — it can offer "restart DSH so the buttons take effect", which a guesser cannot |
| To accept | Tab, then Enter | **one click sends it** |
| If unwanted | ignore it or press Esc | just don't look at it; it never occupies the composer |

## Install

```bash
dsh plugin --profile desktop add dsh-suggest-actions
```

Then **restart DSH and reload the page** — the host reads its plugin list only at startup, and the client bundle has to be re-fetched. Both steps matter.

## How it works

- **Host side**: registers a non-blocking `suggest_actions` tool. It returns immediately — the model calls it once to close a turn, passing 2-3 suggestions.
- **Client side** draws in two places:
  - a *silent collector* on `tool.call.toolview` — records the suggestions into plugin memory and renders nothing;
  - a *renderer* on `conversation.chat.turnTail` — reads that memory and draws the buttons.
- **Why the turn tail**: DSH folds "process" (thinking + tool calls) into a single collapsed line, so anything drawn inside a tool card is hidden by default. The turn tail sits outside that folding, so the buttons stay visible even when the process is collapsed.
- **Clicking** goes through `conversation.input.shell(sessionId).actions` (set draft → submit) — the exact same path as typing the sentence and pressing Enter.

## Limits

- Requires the DSH **0.1.7** line (`conversation.chat.turnTail`, `conversation.input.shell`, `tool.call.toolview`).
- Button text comes from the model; keep labels under ~20 characters or they look heavy.
- A click sends immediately, with no confirmation — by design, not by oversight.
- Rapid clicks are debounced for ~0.9s.

## License

MIT
