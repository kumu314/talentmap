/* 天赋星图 · Umami 接入层（零依赖，纯前端）
 * 作用：加载自托管 Umami 追踪脚本，并暴露 tmTrack() 上报漏斗事件。
 * 配置：改 window.UMAMI_CFG（见下方）。WEBSITE_ID 留空 → 完全不加载、不发起任何外部请求、不影响现有 UTM 计数。
 * 漏斗事件：quiz_complete（完成测评）、report_view（查看报告）。页面浏览量由 Umami 自动记录。
 * 降级：Umami 未就绪/未配置时，tmTrack 静默 no-op；现有 localStorage 计数与 ?debug=1 本地面板照常工作。
 */
window.UMAMI_CFG = window.UMAMI_CFG || {
  URL: 'https://analytics.example.com',   // ← 改成你的 Umami 实例地址（自托管或 Umami Cloud）
  WEBSITE_ID: '',                          // ← 在 Umami 后台 Websites → 你的站点 → Settings 里复制 Website ID
  // 提示：同时在后台开启 Query Parameters 包含 "from"，页面浏览量也会自动按视频来源归类
};

(function () {
  var cfg = window.UMAMI_CFG || {};
  var id = cfg.WEBSITE_ID;

  // 未配置：定义空函数即退出，不发起任何外部请求
  if (!id) {
    window.tmTrack = function () {};
    return;
  }

  // 注入 Umami 官方追踪脚本（异步，不阻塞渲染）
  var base = (cfg.URL || 'https://analytics.umami.is').replace(/\/+$/, '');
  var s = document.createElement('script');
  s.async = true;
  s.src = base + '/script.js';
  s.setAttribute('data-website-id', id);
  s.setAttribute('data-auto-track', 'true');
  document.head.appendChild(s);

  // 漏斗事件上报：自动把 ?from= 作为维度带上；umami 未就绪时静默跳过
  window.tmTrack = function (name, props) {
    props = props || {};
    try {
      var f = new URLSearchParams(location.search).get('from');
      if (f && !('from' in props)) {
        var copy = {};
        for (var k in props) { if (props.hasOwnProperty(k)) copy[k] = props[k]; }
        copy.from = f;
        props = copy;
      }
    } catch (e) {}
    if (window.umami && typeof window.umami.track === 'function') {
      try { window.umami.track(name, props); } catch (e) {}
    }
  };
})();
