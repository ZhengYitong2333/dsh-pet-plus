# 发布与插件市场清单

本包已包含 DSH 商城预检所需的元数据；发布前按下面顺序过一遍。

## 1. 包元数据

```jsonc
{
  "name": "dsh-pet-plus",
  "version": "0.1.0",
  "description": "…",
  "license": "MIT",
  "homepage": "https://github.com/ZhengYitong2333/dsh-pet-plus#readme",
  "repository": { "type": "git", "url": "git+https://github.com/ZhengYitong2333/dsh-pet-plus.git" },
  "engines": { "node": ">=22.13.0" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-connection"] },
    "compatibility": { "dshReleases": { "0.2.1-rc.2": "compatible", "0.2.1-rc.3": "compatible" } }
  }
}
```

要点：

- `dsh.bundle.patch` 指向的 `cordis.patch.yml` 里 entry `id` 必须与包名一致；
- `dsh.client` 让宿主同时加载浏览器半侧（`lib/client.js`）；
- `files` 必须包含 `lib`、`assets`、`runtime/electron-helper`、`cordis.patch.yml`、README/docs；
- 不要把 `main-config.jsonc`、记忆文件、`chrome-profile/`、任何密钥打进包。

## 2. 发布前检查

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm check:secrets
node scripts/prepack-check.js
npm pack --dry-run
```

`npm pack --dry-run` 重点看：

- `lib/index.js`、`lib/client.js` 都在；
- `runtime/electron-helper/` 的 `main.js`、`preload.js`、`suggest.html` 等都在；
- 没有配置/记忆/密钥文件。

## 3. 发布

```bash
npm publish --access public
```

发布后在 DSH 里安装：

```bash
dsh plugin --profile web add dsh-pet-plus
```

再把 `dsh-pet-plus` 加进 `dsh.profile.bundles`，重启 DSH。

> npm 包名若已被占用，可改用 scope（如 `@yourname/dsh-pet-plus`），
> 同时把 `cordis.patch.yml` 的 entry `id` 与包名对齐。

## 4. 商城描述素材

- 封面/预览图：`docs/assets/companion.png`、`docs/assets/global-hotkey.png`、`docs/assets/hero.gif`
- 一句话：会记住你的桌宠：四层记忆 + 微信/QQ + 内容副驾 + 三条输入候选
- 关键词：`dsh-plugin`、`desktop-pet`、`memory`、`wechat`、`qq`、`onebot`、`douyin`、`xiaohongshu`
- 隐私说明：全部本地存储；密钥走 DSH credentials / 环境变量；不内置账号、cookie、代理。

## 5. 版本与兼容

- 破坏性变更升 minor，并更新 `dsh.compatibility.dshReleases`；
- 每个版本更新 `CHANGELOG.md`；
- 新 DSH 版本先跑 `pnpm typecheck && pnpm test && pnpm build`，再打 compatible 标记。
