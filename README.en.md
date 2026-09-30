# dsh-suggest-actions

Clickable **next-step suggestions** under every reply in DeepSeek Harness. One click sends that text as your message — no typing.

It answers "I've read it, now should it do A or B": instead of composing the sentence yourself, just click it.

## Not the same thing as "composer completion"

There are already a few "next sentence" plugins (`dsh-suggest-prompt`, `dsh-prompt-for-me`, `dsh-suggest-ghost`, `dsh-input-assist`). They all live **inside the composer** as ghost text: they fire an **extra model call** to guess what you would say, offer one line, you accept with Tab, then **press Enter yourself**.

This one takes a different route:

|  | Composer completion | This plugin |
|---|---|---|
| Where | inside the composer | **under the reply** (turn tail) |
| How many | one | **up to 5 by default**, all shown (extra ones fold away only if you raise the cap) |
| Who decides | the plugin guesses | **the model, from context** — it can offer "restart DSH so the buttons take effect", which a guesser cannot |
| Extra cost | **an extra model call** (a separate request to guess) | **no extra call** — the suggestions ride along as the main model closes its turn |
| To accept | Tab, then Enter | **one click sends it** |
| If unwanted | ignore it or press Esc | just don't look at it; it never occupies the composer |

## Install

```bash
dsh plugin --profile desktop add dsh-suggest-actions
```

Then **restart DSH and reload the page** — the host reads its plugin list only at startup, and the client bundle has to be re-fetched. Both steps matter.

## How it works

- **Host side**: registers a non-blocking `suggest_actions` tool. It returns immediately — the model calls it once to close a turn, passing 2-5 suggestions.
- **Client side** draws in two places:
  - a *silent collector* on `tool.call.toolview` — records the suggestions into plugin memory and renders nothing;
  - a *renderer* on `conversation.chat.turnTail` — reads that memory and draws the buttons.
- **Why the turn tail**: DSH folds "process" (thinking + tool calls) into a single collapsed line, so anything drawn inside a tool card is hidden by default. The turn tail sits outside that folding, so the buttons stay visible even when the process is collapsed.
- **Clicking** goes through `conversation.input.shell(sessionId).actions` (set draft → submit) — the exact same path as typing the sentence and pressing Enter.

## Stances and the recommended pick

Two things were added on top of a plain list of sentences.

**Stance.** Every suggestion carries one, and there are five: cautious (a smaller step — confirm before going further), standard (the normal next move along the current route), bold (same route, pushed faster and with more risk taken), alternative (the current approach is dropped), stop (this need not be done at all). A stance appears at most once per turn — repeats are dropped and the free slots go to other angles, so three suggestions that are really the same move never reach you. Five is the maximum (one per stance); when only two are worth offering, you get two.

The stance is **not drawn on the button**: it is a format constraint on the model. That is the point — telling a model "please offer different angles" is advice it can ignore, whereas a required field cannot be ignored.

**Pick.** The model marks the one it would do first, independently of its position in the list — the marked entry is moved to the top and carries a small badge. Its background is the same as the other buttons; only hovering darkens it, like every other button. A `stop` entry ("this need not be done") is pushed to the bottom wherever it was given; the rest keep the order you gave. When the options are genuinely interchangeable, nothing is marked.

**Hover a button** (or focus it with the keyboard) and it unfolds in place, showing the sentence that will actually be sent; move away and it folds back. The point is to keep "what you see" and "what gets sent" aligned — the label is a summary, and the sentence actually sent is usually longer. That sentence lives **outside the button** (a sibling element), so clicking it never sends anything — select and copy as you like.

**All buttons share one width**, sized by the longest label rather than each one's own content: the arrows line up in a column, and a long instruction no longer stretches its button.

**All shown by default**: the per-turn cap is 5 (one per stance), and all of them render at once. The folding code is still there, but its threshold (5) equals the cap, so it normally never fires; raise the cap to 6 and the extra entry folds into a single "N more" line that unfolds in place when clicked — the unfolded ones are clickable too. The unfolded state is deliberately not remembered — scroll away and come back, and it is collapsed again.

The few words the plugin draws itself ("Recommended", "N more", "Show less") follow the interface language: Chinese in a Chinese UI, English otherwise.

Suggestions without a stance still render (backwards compatible).

## Limits

- Requires the DSH **0.1.7** line (`conversation.chat.turnTail`, `conversation.input.shell`, `tool.call.toolview`).
- Button text comes from the model; keep labels under ~20 characters or they look heavy.
- A click sends immediately, with no confirmation — by design, not by oversight.
- Rapid clicks are debounced for ~0.9s.

## License

MIT
