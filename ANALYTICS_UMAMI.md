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
| `track.js` | 埋点层。读 `UMAMI_CFG`：**始终写本机漏斗计数**（`talentmap_funnel`，只有事件名/次数/日期）；配了 `WEBSITE_ID` 才注入官方脚本并上报同名事件。DNT 或 me.html 开关可整体关掉两条通道。 |
| 12 页 `<head>` | 引入 `<script src="track.js"></script>`（非 defer，保证 `tmTrack` 早于页面内联脚本定义）。`thanks.html` 无交互，未引入。 |
| 全站 | 漏斗事件已按「测→报告→行动→传播→可携」补全，见文末「八、漏斗事件全表」。 |
| `backup.js`（新增） | 备份与恢复的信封契约：`talentmap_all` / `talentmap_item` / `talentmap_diary` 三种形状都读得回来，写入前存 `talentmap_preimport` 快照供一键还原；读不懂就吵，不做静默降级。被 `me.html` 与 `action.html` 引入。 |

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

---

## 八、漏斗事件全表（2026-10-26 补全）

命名约定：`对象_动作`，全小写下划线；props 只放维度，不放内容（绝不上传用户写的文字、星图标签值）。

共 47 个事件名、54 处 `tmTrack` 调用，分布在 8 个页面：index 2 / landing 1 / quiz 9 / report 10 / action 11 / stories 2 / companion 6 / me 13。其中 `exp_done` 与 `exp_undo` 共用一处三元调用；5 个名字各有多个调用点（`backup_failed` 5 处：本机读回/写入/生成码三处失败分支 + 行动页两处；`gate_start` 2 处：按钮进入 + 跨关自动进入；`gate_done` 2 处：逐关完成 + 第四关收尾；`friend_import` 2 处：解码成功与失败；`backup_import` 2 处：两个页面各一处），所以 54 处调用落在 47 个不重名事件上。

| 页 | 事件 | 触发点 | props |
|---|---|---|---|
| index | `taste_open` | 点开「一分钟尝一口」 | — |
| index | `taste_pick` | 点了某个兴趣方向 | ria |
| landing | `landing_cta` | 点任意「开始测」CTA | —（from 自动带） |
| quiz | `recall_start` | 第 0 关点「开始回想」 | — |
| quiz | `recall_done` | 三件小事回想完 | notes |
| quiz | `gate_start` | 点「开始这一关」 | gate |
| quiz | `gate_done` | 点「继续下一关」（1–3 关）；第 4 关答完即记 | gate |
| quiz | `quiz_resume` / `quiz_restart` | 断点续测里选继续 / 重测 | phase / — |
| quiz | `quiz_complete` | 出结果 | seconds, recall |
| report | `report_view` | 报告页加载 | shared, has_result |
| report | `share_card_open` / `share_img_dl` | 打开分享卡 / 保存图片 | — / size |
| report | `copy_moment` / `copy_link` | 复制朋友圈文案 / 星图码链接 | — |
| report | `friend_import` | 粘贴好友星图码 | ok（1 成功 / 0 解析失败） |
| report | `mirror_save` | 他人镜子记下三个词 | total |
| report | `gal_open` / `hist_clean` | 点往期星图卡片 / 清空对比历史 | — |
| action | `diary_save` / `diary_delete` | 记下今天那一下 / 划掉一条 | day, layer, star / — |
| action | `exp_done` / `exp_undo` | 勾上 / 取消 7 天微实验 | done（当前完成数） |
| action | `week_copy` / `week_download` / `diary_copy` | 周摘要复制 / 存文本 / 复制日记 | — |
| action | `backup_download` / `backup_import` | 下载 JSON 备份 / 导入 | n / added |
| action me | `backup_failed` | 备份读不了 / 版本不认识 / 写不进去（按 src 分文件、粘贴码、生成码） | src |
| action | `remind_toggle` | 每日提醒开关 | on |
| stories | `story_seed_save` / `story_export` | 保存故事种子 / 导出 txt | layer / n |
| companion | `companion_ask` / `companion_preset` | 发一句话 / 点预设按钮 | — / q |
| companion | `companion_no_data` | 没测评结果就打开伙伴 | — |
| companion | `feedback_saved` / `copy_feedback` | 反馈存本机 / 复制反馈文本 | — |
| companion | `survey_open` | 点站外问卷链接（问卷在金数据里提交，本站看不到填没填） | — |
| me | `export_all` / `item_export` / `item_delete` / `clear_all` | 数据自助操作 | n / — |
| me | `export_code` | 复制备份码（手机上不带文件走） | n |
| me | `backup_restore` | 用导入前快照还原 | n |
| me | `tracking_on` / `tracking_off` | 拨漏斗计数开关 | — |
| me | `funnel_copy` | 复制本机走查摘要（用户自愿带走，仍不发请求） | n |

**关键读法（起好 Umami 后能直接算出来的东西）：**
- 第 0 关流失：`recall_start` → `recall_done`；四关流失：`gate_start#n` → `gate_done#n`（本机计数键自带 `#gate2` 这类后缀）。
- 「测了但没看报告」：`quiz_complete` vs `report_view`；`report_view{has_result:0}` 就是白跑一趟的人。
- 传播有没有发生：`copy_moment + copy_link + share_img_dl` 除以 `report_view`；`friend_import{ok:0}` 高说明星图码粘贴体验有问题。
- 可携性有没有闭环：导过备份的人里有多少真的导入成功——`export_all` / `export_code` 对上 `backup_import`；`backup_failed` 按 `src` 分开看：`file` 多说明文件在设备间搬运坏了，`paste` 多说明备份码复制时被截断，`code` 多说明这台设备连 base64 都生成不了（该改用下载）。`backup_restore` 不为 0 说明有人导入完就反悔，快照那层买对了。
- 行动闭环有没有接上：`report_view` → `diary_save` → `exp_done`；`companion_no_data` 高说明入口把人带到了读不到结果的地方。

**隐私边界（改动后要守住的口径）：**
- 取证口径不看「主机集合变没变」，看「每条外联是哪个文档发起的」。10 个页面各跑 2 遍、每遍等 8 秒，**由本站文档发起的对外请求为 0 条**；companion.html 上那 140 条全部由第三方表单文档 `k68wjncs.jsjform.com/f/do4TtQ` 自己发起，含它自家的 4 个资源域名和 1 条 Google gtag（`/gtag/js?id=G-FYKFYPNXQS`）——是金数据在统计它自己的页面。之前按「改前/改后主机集合对拍」会误报：那条 gtag 是慢加载，3.5 秒有时抓不到、8 秒也有时抓不到，同一份文件跑两遍结果不同；归因口径不受这个抖动影响。
- 只要 `WEBSITE_ID` 为空，埋点这层就是**零外部请求**（`backup.js` 同样只读写 localStorage，不发请求）——`companion.html` / `faq.html` / `index.html` / `me.html` 里「不经过任何服务器」的说法继续成立；`talentmap_funnel` 也在 localStorage 里，me.html 可读、可复制摘要、可关、可清、可导出。
- 记不记由这台设备说了算：`me.html` 的本机开关优先，没手动设置时跟随浏览器 `doNotTrack` / `globalPrivacyControl`。被拦下时本机计数停、Umami 脚本根本不注入。

## 九、不接 Umami 时，这条漏斗怎么闭环（2026-10-26 落地）

Umami 要一台 7×24 的 HTTPS 主机，那台机器不在本项目手里，所以**先不接**，把「主机无关」的那半做完：

- **本机自读**：`me.html` 的「这台设备走到了哪一步」把 `talentmap_funnel.counts` 按 13 个里程碑渲染成步骤条，
  每步给「开始 n / 完成 m」和最近日期，末尾一行直接算出「最远走到」与「看上去停在」。数字口径与第八节的关键读法一致，
  只是算在用户自己的浏览器里。原始明细仍在 `report.html?debug=1`。
- **用户自愿携带**：同一页「复制走查摘要」把同一份计数变成一段纯文本（步骤名 + 次数 + 日期区间 + 开关状态 + `from` 标记），
  由访问者自己贴进伙伴页的反馈框或站外问卷。**这一步是用户发起的，本站代码不发任何请求**，零外联取证口径不变。
- **摘要有没有内容泄露**：`talentmap_funnel` 的键只由「事件名 + 维度白名单（gate/ok）」构成，props 里从来不写用户文字
  （第八节命名约定），所以摘要在结构上就不可能带上日记、回想、投稿的内容。`verify_round13.py` 用哨兵字符串把这条钉住：往日记里塞一句只有测试知道的话，再断言它不出现在摘要和面板文本里。

**这条路的读数边界（必须写清，否则会被当成转化率用）：**
- 样本是**自选择**的——只有愿意复制并贴回来的人才会出现，通常是走得比较顺或特别在意的人；
  沉默的流失者不会贡献任何摘要。
- 因此它能看**形状**（关卡内部哪里开始多完成少、`report_view` 之后有没有人回行动页），**不能看比例**：
  「10 份摘要里有 3 份停在第四关」不等于「30% 的人卡在第四关」。
- 要拿真正的转化率，仍然要么接一台 Umami（第三、四节），要么在问卷里加一道「你走到第几关」的自报题——后者更便宜，且不新增外联。

