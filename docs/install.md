# 安装与加载

## 从源码安装（开发 / 本地体验）

```bash
git clone git@github.com:ZhengYitong2333/dsh-pet-plus.git
cd dsh-pet-plus
pnpm install
pnpm build

node scripts/install-local.mjs --profile web
# 桌面端：node scripts/install-local.mjs --profile desktop
```

脚本会：

1. `dsh plugin --profile <profile> add link:<repo>` 把当前仓库链进 profile；
2. 把 `dsh-pet-plus` 追加到 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles`；若原版 `dsh-pet` 已在列表中，则移除它，避免重复注册服务；
3. 打印重启与验证命令。

**重启 DSH**（profile 包列表只在启动时读取），然后刷新 Web 页面。

Web profile 可以这样启动（端口可换；启动日志会打印带 token 的完整 URL）：

```bash
dsh web --no-open --port 51769
```

## 验证加载

```bash
# 把 DSH 启动时打印的完整 URL 传进来（必须带 token，否则首页 401）
pnpm verify:web --url "http://127.0.0.1:51769/?token=..."

# 等价于手动检查宿主路由
curl -s http://127.0.0.1:51769/dsh-pet-plus/config | head -c 120
```

`verify:web` 会：

1. 读取首页里的 `window.__DSH_BOOT__`，确认 `dsh-pet-plus` 在插件图里；
2. 按真实的组合 URL（`/plugins/??dsh-pet-plus/client.js&rev=...`）拉取浏览器半侧并检查内容；
3. 请求 `/dsh-pet-plus/config` 与 `/dsh-pet-plus/todo`，确认宿主路由在线。

> ⚠️ 不要直接 `curl /plugins/dsh-pet-plus/client.js` —— DSH 的客户端资源带修订号，
> 裸路径一定 404（这是 DSH 0.2.x 的正常行为，不是插件没装好）。

通过后打开设置页应能看到「桌宠配置」与「桌宠 Plus」两个分区；页面右下角的 ✦ 打开伴侣面板。

## 卸载

```bash
dsh plugin --profile web remove dsh-pet-plus
```

再从 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里删掉 `dsh-pet-plus`，重启 DSH。

## 配置与数据

- 配置：`$DSH_HOME/dsh-pet-plus/main-config.jsonc`
- 记忆：同目录 `profile.json` / `episodes.jsonl` / `memory.json`
- 日志：`content-log.jsonl`；Chrome profile：`chrome-profile/`
- 密钥：DSH credentials 或 `DSH_PET_PLUS_*` 环境变量，**不要写进配置文件**

## 常见问题

| 现象 | 处理 |
|---|---|
| 设置页没有分区 | 检查 bundles 是否包含 `dsh-pet-plus`，并重启 DSH |
| `client.js` 404 | 先确认用的是带 `rev` 的组合 URL（跑 `pnpm verify:web`），再检查 `pnpm build` 与 profile link |
| 伴侣面板一直「加载中」 | 点标题栏 ↻ 或再按一次 `Mod+Alt+J` 重载当前 tab；8 秒超时会显示「重试」 |
| 宠物不显示 | 设置 → 桌宠配置 → 显示位置选 `网页`/`两者`；刷新页面 |
| 记忆不注入 | 设置 → 桌宠 Plus → 启用记忆；查看「预览注入」 |
| 微信扫码失败 | 确认 DSH 版本 ≥ 0.2.1；ClawBot 可能是灰度 |
