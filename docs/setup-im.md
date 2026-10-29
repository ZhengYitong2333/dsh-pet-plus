# 微信 / QQ 接入

三个通道共用同一条管线：入站 → 白名单 → 去重 → 限流 → 桌宠对话（L2/L1 记忆 + 人设）→ 原通道回复。
所有回复都走当前**主宠物**的对话配置；IM 不额外调用模型。

---

## 1. 微信 A：官方 ClawBot / iLink 直连

**前提**：DSH 0.2.1+、一个微信小号、手机微信能扫码。ClawBot 目前是 Public Beta。

1. 设置 → 桌宠 Plus → 微信 / QQ：
   - 勾选「微信启用」；
   - 模式选 `ClawBot / iLink 直连`；
   - 需要限制谁能聊时，在「iLink 白名单」填对方的 iLink id（逗号分隔）；留空 = 不限制（不建议）。
2. 点「扫码绑定微信 ClawBot」，用微信扫码确认。
3. 绑定成功后 token 写入 DSH credentials：`DSH_PET_PLUS_WECHAT_BOT_TOKEN`，不会落进配置文件。
4. 重启 DSH 后会自动恢复长轮询（`getupdates`，35s 长轮询）。

限制（腾讯侧，不是本插件限制）：

- **仅单聊**，不能进群；
- 一个微信号只能绑一只 Bot；
- Bot 头像不能改，名字只能通过微信备注改；
- 平台可能限流/灰度，失败时 `/im/status` 会给出 `lastError`。

---

## 2. 微信 B：通用桥（Wechaty / WeChatAgent / GeWe…）

适合已经有桥服务、或者需要群聊的场景。

配置（设置页或 `main-config.jsonc`）：

```jsonc
"im": {
  "weixin": {
    "enabled": true,
    "mode": "bridge",
    "bridge": {
      "outboundUrl": "http://127.0.0.1:8787/send", // 你的桥的发消息接口
      "allowFrom": ["wxid_xxx"],                   // 单聊白名单，必填
      "allowGroups": ["123456@chatroom"]           // 群白名单，必填（只处理 @ 到 Bot 的消息）
    }
  }
}
```

桥 → DSH 的入站请求：

```bash
curl -X POST http://127.0.0.1:51769/dsh-pet-plus/im/bridge/event \
  -H 'content-type: application/json' \
  -d '{
    "token": "你的 inboundSecret",
    "eventId": "msg-001",
    "from": { "id": "wxid_xxx", "name": "老王", "roomId": "123456@chatroom" },
    "text": "@大肥鱼 今天几号",
    "mentioned": true
  }'
```

- `token` 对应 `DSH_PET_PLUS_BRIDGE_SECRET` 环境变量或配置里的 `bridge.inboundSecret`；
- 群消息必须 `mentioned: true`，否则直接丢弃；
- `eventId` 用于 10 分钟去重，没有就按 `from + 文本前 40 字` 去重。

DSH → 桥的出站请求：

```json
{ "to": "wxid_xxx", "text": "回复内容", "roomId": "123456@chatroom" }
```

桥返回 2xx 即视为发送成功。

---

## 3. QQ：OneBot v11（NapCat / Lagrange）

1. 启动 NapCat / Lagrange，开启 **HTTP API** 与 **HTTP POST 上报**。
2. 设置页填：
   - 「QQ 启用」；
   - 「QQ OneBot 地址」= HTTP API 地址，例如 `http://127.0.0.1:3000`；
   - 「QQ 机器人 QQ 号」= Bot 自己的 QQ 号（群聊里判断有没有 @ 到它）；
   - 「QQ 白名单」= 允许私聊的 QQ 号（逗号分隔）；群聊白名单在 `im.qq.allowGroups` 配；
   - 「QQ 自动回复」按需关闭（关闭后只记录不回复）。
3. 上报地址填：`http://127.0.0.1:51769/dsh-pet-plus/im/qq/event`。
4. 密钥用环境变量，别写配置文件：

```bash
export DSH_PET_PLUS_QQ_ACCESS_TOKEN=<你的 access token>
export DSH_PET_PLUS_QQ_EVENT_SECRET=<你的上报 secret>
```

`accessToken` 会以 `Authorization: Bearer ...` 发给 OneBot；`eventSecret` 用于校验上报体的 `secret` 字段。

行为：

- 私聊：白名单内直接回；
- 群聊：只处理 @Bot 或以 `@` 开头的消息，且群必须在 `allowGroups`；
- 限流：默认 6 条/分钟、100 条/天/人，可在配置里改。

---

## 4. 自测

```bash
# 看状态（iLink 是否在线、QQ 是否启用）
curl -s http://127.0.0.1:51769/dsh-pet-plus/im/status | jq

# 主动发一条（调试用）
curl -s -X POST http://127.0.0.1:51769/dsh-pet-plus/im/send \
  -H 'content-type: application/json' \
  -d '{"channel":"qq","to":"123456789","text":"在吗"}'
```

---

## 5. 安全边界

- 白名单为空时：iLink 不限制；桥和 QQ **必须**配白名单，否则群里任何人 @ 都会触发；
- 不处理图片/文件/语音，只处理文本；
- 日志只记通道、方向、长度，不记正文；
- 不要在共享机器上把 `DSH_PET_PLUS_*` 密钥写进 shell profile 后提交。
