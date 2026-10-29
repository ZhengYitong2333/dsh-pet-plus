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
2. 把 `dsh-pet-plus` 追加到 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles`；
3. 打印重启与验证命令。

**重启 DSH**（profile 包列表只在启动时读取），然后刷新 Web 页面。

## 验证加载

```bash
# 浏览器半侧 bundle（IIFE）
curl -s http://127.0.0.1:51769/plugins/dsh-pet-plus/client.js | head -c 80

# 宿主路由
curl -s http://127.0.0.1:51769/dsh-pet-plus/config | head -c 120
```

两条都返回内容即加载成功；打开设置页应能看到「桌宠配置」与「桌宠 Plus」两个分区。

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
| `client.js` 404 | `pnpm build` 是否成功；profile 是否 link 到当前仓库 |
| 宠物不显示 | 设置 → 桌宠配置 → 显示位置选 `网页`/`两者`；刷新页面 |
| 记忆不注入 | 设置 → 桌宠 Plus → 启用记忆；查看「预览注入」 |
| 微信扫码失败 | 确认 DSH 版本 ≥ 0.2.1；ClawBot 可能是灰度 |
