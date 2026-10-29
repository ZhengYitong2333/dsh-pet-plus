# NOTICE

`dsh-pet-plus` 是 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的衍生项目（fork），
基于其 0.3.8 版本源码与素材继续开发。感谢原作者与素材贡献者。

## 代码

- 本项目代码：MIT（见 [LICENSE](LICENSE)）。
- 上游 dsh-pet 代码：MIT。

## 素材

- 动画（`assets/webm/`）、表情包（`assets/memes/`）、通知图标（`assets/pic/`）来自上游 dsh-pet。
  上游声明：**允许开源使用，禁止商用**；使用须保留署名与来源。
- 角色与动画素材由上游社区成员制作；本项目不额外主张权利，仅按上游条款原样分发。
- 字体「上首软糖体」（`assets/fonts/上首软糖体.ttf`）：版权归原字体作者，随上游素材原样分发；
  商用前请自行确认字体授权。


## 音效素材

- `assets/sounds/duck/Ya1.mp3`、`Ya2.mp3`：来自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)，MIT License（Copyright (c) 2025 MeteorNOX）。
- `assets/sounds/click.wav`：本项目用脚本合成的短 pop 音，随项目 MIT 分发。
- 自定义音效：用户放在 `$DSH_HOME/dsh-pet-plus/sounds/`，不上传、不随仓库分发。

## 第三方依赖

构建期依赖（不随包分发）与打包进 `lib/index.js` 的依赖，其许可证以各自包内 LICENSE 为准，主要包括：

- `@electron/get`（MIT）
- `ms`、`debug`、`semver`、`progress`、`sumchecker`、`env-paths`、`graceful-fs`（MIT / ISC）
- `@ffmpeg-installer/ffmpeg`（仅开发期，用于生成 README GIF；GPL/LGPL 以其包内声明为准，不随插件分发）

## 隐私

本仓库不包含任何真实 API key、token、个人配置、聊天记录或浏览器 profile。
`scripts/check-secrets.mjs` 会在提交前与 CI 中扫描并阻断此类内容。
