<p align="center">
  <img src="docs/assets/hero.gif" alt="dsh-pet-plus — a desktop pet that remembers you" width="900">
</p>

<h1 align="center">dsh-pet-plus 🐾</h1>

<p align="center">
  <b>A desktop pet that remembers you.</b><br>
  Four-layer memory · WeChat / QQ bridges · Douyin &amp; Xiaohongshu copilot · three input suggestions · companion panel
</p>

<p align="center">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DSH-0.2.1--rc.3-7c3aed">
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey">
  <img alt="status" src="https://img.shields.io/badge/version-0.1.0-informational">
</p>

> [中文说明](README.md)

---

## Why

[dsh-pet](https://github.com/PC2005-cloud/dsh-pet) gives you a lovely blue fish on your desktop. It forgets everything the moment a conversation ends, only lives inside the web UI, and always waits for you to start.

`dsh-pet-plus` keeps all of that and adds the missing half:

| Missing | What this plugin does |
|---|---|
| Memory | L3 instructions / L2 profile / L1 episodes / L0 session traces, injected under a strict token budget |
| Initiative | `Mod+Alt+K` generates three input suggestions from your profile and recent prompts, and fills the DSH composer |
| Reach | WeChat ClawBot (iLink), generic WeChat bridge, QQ OneBot v11 |
| Presence | Companion panel: todos with countdown, weather, now playing, memory timeline, quick launch, TTS, screenshot explain |

## Highlights

### Four-layer memory

- **L3** — your hand-written `instructions.md`, always injected, never rewritten by the model.
- **L2** — profile entries with dedupe, supersede, tombstones and optimistic locking.
- **L1** — importance-gated episode summaries, promoted into L2 after 7 days.
- **L0** — reuses `ctx.sessionQuery` for DSH sessions; pet chats get their own JSONL.

Injection is capped at 1,500 chars per turn by default; if memory is off or empty the base prompt stays byte-identical. A daily budget (30 calls / 40k tokens) gates extraction and tool calls.

### Three suggestions

`Mod+Alt+K` → three candidates based on your profile, recent inputs and time of day. Click one to put it into the DSH input box. Accepted/discarded suggestions become weak profile signals.

### Companion panel

`Mod+Alt+J` or the ✦ button:

- todos with due-time countdown and overdue highlighting;
- weather and festivals;
- now playing (macOS Music / Spotify);
- memory timeline;
- quick launch for allow-listed apps/URLs;
- TTS via macOS `say`;
- drag text or paste anywhere outside an editor → summarize / translate / explain / turn into a comment;
- 📷 captures the screen, copies it and pastes it into the DSH composer so a multimodal model can explain it.

## Install

```bash
git clone git@github.com:ZhengYitong2333/dsh-pet-plus.git
cd dsh-pet-plus
pnpm install
pnpm build

dsh plugin --profile desktop add link:$PWD
```

Add `dsh-pet-plus` to `dsh.profile.bundles` in `~/.dsh/profiles/desktop/package.json`, then restart DSH.

Requires Node.js ≥ 22.13. The default registry is `registry.npmmirror.com` (change it in `.npmrc`).

## Configuration & privacy

- Config: `$DSH_HOME/dsh-pet-plus/main-config.jsonc`
- Memory files: `memory.json`, `profile.json`, `episodes.jsonl` in the same directory
- Secrets: DSH credentials or `DSH_PET_PLUS_*` environment variables; never plain config
- Nothing leaves your machine except the model / IM requests you configured

See [WeChat & QQ setup](docs/setup-im.md) and [content automation](docs/setup-content.md) (both in Chinese for now).

## Development

```bash
pnpm typecheck
pnpm build
pnpm test:core
pnpm check:secrets
```

Never commit real keys, tokens, `main-config.jsonc`, memory files, traces or Chrome profiles.

## Roadmap

- [x] P0 build / install / README / CI
- [x] P1 four-layer memory + CRUD + budgets
- [x] P2 input history, input-profile extraction, three suggestions
- [x] P3 WeChat iLink + bridge + QQ OneBot
- [x] P4 content copilot + guarded automation
- [x] P5 todos / weather / drag-ask / click sound / click balance / screenshot
- [x] P6 music / quick launch / TTS / memory timeline
- [x] Dynamic island: top status capsule with next todo, work state, music and memory count
- [ ] P7 global hotkey, Live2D/VRM, real-platform selector calibration

## License

MIT. The bundled dsh-pet assets keep their original non-commercial terms — see [NOTICE.md](NOTICE.md).
