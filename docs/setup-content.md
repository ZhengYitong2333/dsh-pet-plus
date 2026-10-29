# 内容副驾与全自动（抖音 / 小红书）

> ⚠️ 平台明确治理自动浏览、自动评论、私信引流。全自动模式**默认关闭**，且需要你主动勾选风险确认。
> 请只用小号，遵守平台规则；本项目不提供验证码绕过、不提供私信/关注/点赞自动化。

---

## 1. 手动副驾（推荐先从这个开始）

入口有三个：

1. 伴侣面板 → 「内容」tab，粘贴链接 → 读一下；
2. `/digest <链接>` 斜杠命令；
3. `POST /dsh-pet-plus/content/digest`：`{"link":"https://v.douyin.com/..."}` 或 `{"text":"..."}`。

输出：

- 一句话摘要；
- 3 个要点；
- 3 条评论候选（真诚 / 幽默 / 专业）；
- 风险提示（引战、广告法、医疗/金融等敏感词）。

结果缓存 10 分钟，避免重复烧 token。**发送永远由你手动完成**。

---

## 2. 全自动模式

设置 → 桌宠 Plus → 内容自动化：

| 开关 | 含义 |
|---|---|
| 启用 | 打开自动任务（仍需下面的风险确认） |
| 已确认风险 | 明确知道可能封号，建议小号 |
| 预演模式 | 只生成、不发送（默认开） |

启动后按配置的间隔扫推荐流 → 生成评论 →（预演模式下只写日志）→ 发送。

### 安全阀（硬编码，UI 不能绕过）

- 默认关闭 + 必须 `acknowledged: true`；
- `dryRun` 默认 `true`；
- 每 10 分钟最多 3 条、每天最多 30 条（`auto.limits`）；
- 随机间隔（默认 20–90 秒，可配 5–1200 秒），不是固定节拍；
- 静默时段默认 23:00–08:00（`auto.quietHours`）不动作；
- 黑名单账号/关键词直接跳过；
- 检测到验证码/滑块/“操作过于频繁” → 立即停止并记录；
- 不私信、不关注、不点赞、不改资料；
- 随时可在设置页点「停止」。

### 配置

```jsonc
"content": {
  "enabled": true,
  "cacheMinutes": 10,
  "dailyCalls": 20,
  "auto": {
    "enabled": false,
    "acknowledged": false,
    "dryRun": true,
    "platforms": { "douyin": true, "xhs": true },
    "limits": {
      "per10min": 3,
      "perDay": 30,
      "minGapSec": 45,   // 5–600
      "maxGapSec": 150   // 10–1200
    },
    "quietHours": ["23:00", "08:00"],  // null = 不设静默时段
    "blacklist": ["关键词", "账号名"],
    "chromePath": "",     // 空 = 自动探测 Chrome/Chromium
    "profileDir": "",     // 空 = $DSH_HOME/dsh-pet-plus/chrome-profile
    "maxScrolls": 20
  }
}
```

### CDP 前置条件

自动浏览/发送依赖 Chrome DevTools Protocol：

1. 用调试端口启动 Chrome：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.dsh/chrome-profile"
```

2. 在这个 Chrome 里手动登录抖音/小红书；
3. 确认 `http://127.0.0.1:9222/json/version` 能打开；
4. 再启动自动模式。

> 平台 DOM 会变，选择器集中在 `src/host/content/platforms.ts`，失效时改这里即可。
> 本项目不会内置账号、cookie 或代理。

### 选择器实机校准

先按上面的命令带着调试端口启动 Chrome 并登录，然后：

```bash
pnpm check:selectors --port 9222 --platform douyin
pnpm check:selectors --port 9222 --platform xhs
```

输出会逐个列出 `feedCards / commentButton / commentInput / submitButton` 的命中数：

- 全部 `✓`：选择器可用，可以试 `dryRun`；
- 某项 `✗ 0 个`：先确认页面停在首页/推荐流、已登录；仍是 0 就按页面实际 DOM 改
  `src/host/content/platforms.ts`，再跑一次；
- `-1`：选择器语法错误。

脚本只读 DOM，不滚动、不点击、不发送。

---

## 3. 日志

- 设置页「刷新日志」；
- `GET /dsh-pet-plus/content/auto/logs`；
- 日志只记时间、动作、结果、跳过原因，不记 cookie/token。

---

## 4. 关闭

- 设置页「停止」；
- `POST /dsh-pet-plus/content/auto/stop`；
- 或直接把 `content.auto.enabled` 设为 `false` 并重启。
