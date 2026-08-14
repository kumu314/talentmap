# 天赋星图 · Umami 接入方案

> 目标：把已有的 `?from=bili01 / ?from=xhs01` 视频来源追踪，从「单人 localStorage 计数」升级成「全网访客汇总、按来源看转化」的真实分析。
> 选 Umami 的原因：开源、自托管、隐私友好、数据在自己手里——和站点「把被放大生命力的人变成后来者的光」的气质一致。

---

## 一、现状与边界（先说清）

- 前端已完成：落地页读 `?from=` → 改写三处 CTA → quiz 透传 → report 来源条 + `?debug=1` 本地面板。
- 但纯前端 `localStorage` 计数**只能看你自己这台设备**，换设备/清缓存清零，**无法汇总所有访客**。
- Umami 解决的就是"全网汇总"。它是服务端程序（要跑一个数据库），所以：
  - **静态前端**（CloudStudio 沙箱）只负责发数据；
  - **Umami 服务**必须放在另一台能持久运行的主机上（本机/免费云/VPS 均可）。
  - 前端代码现已就绪（`track.js` + 漏斗事件），**WEBSITE_ID 留空时不发任何请求、完全静默**，可以先上线，等你起好 Umami 再填 ID 激活。

---

## 二、前端改动（已落地，无需再动）

| 文件 | 改动 |
|---|---|
| `track.js`（新增） | Umami 接入层。读 `UMAMI_CFG`，注入官方脚本，暴露 `tmTrack()`。WEBSITE_ID 空 → no-op。 |
| 全部 7 页 `<head>` | 引入 `<script src="track.js"></script>`（非 defer，保证 `tmTrack` 早于页面内联脚本定义）。 |
| `quiz.html` | 出结果时 `tmTrack('quiz_complete')`——关键转化：完成测评。 |
| `report.html` | 报告渲染时 `tmTrack('report_view')`——次级转化：查看报告。 |

页面浏览量由 Umami `data-auto-track` 自动记录（落地页/测评页/报告页/其他页都算）。
漏斗事件自动带上 `from` 维度（从 URL `?from=` 读取），即使后台没开 Query Parameters 也能按来源分组。

---

## 三、自托管步骤（你来做，零代码）

### 方案 A：自己的机器 / 树莓派 / 任意 VPS（长期免费或低成本）
1. 装 Docker + Docker Compose。
2. 用仓库里的 `docker-compose.yml`，改 `UMAMI_SECRET` 为随机串：
   ```bash
   cd talent-map
   UMAMI_SECRET=$(openssl rand -hex 16) docker compose up -d
   ```
3. 打开 `http://<机器IP>:3000` → 注册 → **Add website**（Name 随意，Domain 填你的站点域名或留空）→ 复制 **Website ID**。
4. 编辑 `talent-map/track.js`：
   ```js
   window.UMAMI_CFG = {
     URL: 'http://<机器IP>:3000',   // 或你绑的域名 https://analytics.yourdomain.com
     WEBSITE_ID: '这里粘贴Website ID',
   };
   ```
5. 重新部署前端（CloudStudio 或你自己的静态托管）。完事。

### 方案 B：免费云（学生零预算首选）
- **Oracle Cloud Always-Free**：永久免费 2 台 ARM 虚拟机（4 OCPU/24GB），能跑 Umami + Postgres，需信用卡验证但不扣费。最稳的长期零成本方案。
- **Fly.io 免费档**：3 个共享 VM + 3GB 持久卷，命令行 `fly launch` 即可；Umami 官方有 Fly 部署示例。
- 步骤同 A，只是把 `docker compose` 换成对应平台的部署命令。

### 方案 C：Umami Cloud（不想管服务器）
- 官网 umami.is 有免费试用，之后付费。好处是零运维，坏处是数据在第三方、且不是零成本。适合先验证再决定。

---

## 四、后台必开的一项（让来源归类自动生效）

Umami 后台 → 你的 Website → **Settings → Query Parameters**，加入 `from`。
开启后，所有 `?from=bili01` 的页面浏览量会自动按来源归类，配合 `quiz_complete` / `report_view` 两个事件，就能在 Umami 里直接看：

```
各视频来源 → 落地页浏览量 → 完成测评数(quiz_complete) → 查看报告数(report_view)
```

看板里切到 **Events** 标签看 `quiz_complete` / `report_view` 按 `from` 的分布；
**Pages** 标签看各页浏览量（带 `from` 参数维度）。

---

## 五、怎么给视频挂链接（沿用已定的 CTA 策略）

| 视频平台 | 链接 |
|---|---|
| B站 第1条 | `.../landing.html?from=bili01` |
| 小红书 | `.../landing.html?from=xhs01` |
| 抖音 | `.../landing.html?from=dy01` |
| 微博 | `.../landing.html?from=wb01` |
| 公众号 | `.../landing.html?from=zh01` |

`from` 标签映射见 `landing.html` / `quiz.html` / `report.html` 里的字典（bili→B站、xhs→小红书、dy/douyin→抖音、wb→微博、zh→公众号、video→视频；未知值显示原串）。

---

## 六、和现有机制的关系

- **localStorage 计数 + `?debug=1` 面板**：保留，作为单人链路自检（你自己在手机上点一遍能看归因）。
- **Umami**：负责全网汇总。两者并存，互不冲突。
- 隐私：Umami 默认不采集 PII、可设 Do-Not-Track 尊重、数据在你自己库里。符合站点调性。

---

## 七、验证清单（起好 Umami 后）

- [ ] `track.js` 的 `WEBSITE_ID` 已填、`URL` 指向可达实例。
- [ ] 浏览器开 `landing.html?from=bili01`，DevTools → Network 能看到对 `script.js` 的请求（200）。
- [ ] Umami 后台实时看板出现该次浏览，且带 `from=bili01`。
- [ ] 走完测评 → 报告，后台 Events 出现 `quiz_complete` / `report_view` 且 `from=bili01`。
- [ ] 换个来源（如 `?from=xhs01`）重复，确认能分开统计。
