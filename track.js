/* 天赋星图 · 埋点层（零依赖，纯前端）
 * 两条通道，事件名一致：
 *   1) 本地漏斗计数（localStorage: talentmap_funnel）——只记「事件名 + 次数 + 日期」，不记你填写的任何内容，不发任何请求。
 *      WEBSITE_ID 留空时它是唯一通道，漏斗照样能走完整条（在 report.html?debug=1 里读，在 me.html 里关或清）。
 *   2) Umami（可选）——填好 UMAMI_CFG.WEBSITE_ID 后额外注入官方脚本，把同名事件连同 props 上报到你的实例。
 * 隐私闸门：me.html 的本机开关优先；没手动设置时跟随浏览器 doNotTrack / globalPrivacyControl。
 *   被拦下时两条通道都停，Umami 脚本也不注入。本机计数每调用重查开关（拨一下就停）；Umami 脚本注入与否在加载时决定，改了开关要刷新页面才接上。
 * 本地计数键给分关事件带维度后缀（gate_start#gate2），Umami 那边仍是结构化 props——本机要的是「卡在第几关」，不靠 props。
 */
window.UMAMI_CFG = window.UMAMI_CFG || {
  URL: 'https://analytics.example.com',   // ← 改成你的 Umami 实例地址（自托管或 Umami Cloud）
  WEBSITE_ID: '',                          // ← 在 Umami 后台 Websites → 你的站点 → Settings 里复制 Website ID
  // 提示：同时在后台开启 Query Parameters 包含 "from"，页面浏览量也会自动按视频来源归类
};

(function () {
  var cfg = window.UMAMI_CFG || {};
  var id = cfg.WEBSITE_ID;
  var FUNNEL_KEY = 'talentmap_funnel';
  var OPTOUT_KEY = 'talentmap_optout';
  var DAY_KEEP = 90;                 // 本机计数最多留 90 天，按日期键裁剪
  var DIMS = ['gate', 'ok'];         // 进本机计数键的维度（白名单，避免键爆炸）

  function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} }

  function browserDNT(){
    try {
      var v = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      if (v === '1' || v === 'yes') return true;
      if (navigator.globalPrivacyControl) return true;
    } catch (e) {}
    return false;
  }
  function isBlocked(){
    var v = lsGet(OPTOUT_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return browserDNT();
  }
  function localDate(){
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function localKey(name, props){
    for (var i = 0; i < DIMS.length; i++){
      var d = DIMS[i];
      if (props && props[d] !== undefined && props[d] !== null) return name + '#' + d + props[d];
    }
    return name;
  }
  function recordLocal(name, props){
    var f;
    try { f = JSON.parse(lsGet(FUNNEL_KEY)); } catch (e) { f = null; }
    if (!f || typeof f !== 'object') f = {};
    if (!f.days || typeof f.days !== 'object') f.days = {};
    if (!f.counts || typeof f.counts !== 'object') f.counts = {};
    var t = Date.now(), day = localDate(), key = localKey(name, props);
    f.v = 1;
    f.first = f.first || t;
    f.last = t;
    if (!f.days[day] || typeof f.days[day] !== 'object') f.days[day] = {};
    f.days[day][key] = (f.days[day][key] || 0) + 1;
    f.counts[key] = (f.counts[key] || 0) + 1;
    var keys = Object.keys(f.days).sort();
    if (keys.length > DAY_KEEP){
      for (var i = 0; i < keys.length - DAY_KEEP; i++) delete f.days[keys[i]];
    }
    lsSet(FUNNEL_KEY, JSON.stringify(f));
  }

  window.tmFunnel = function(){
    try { return JSON.parse(lsGet(FUNNEL_KEY)) || null; } catch (e) { return null; }
  };
  window.tmClearFunnel = function(){ lsDel(FUNNEL_KEY); return true; };
  window.tmOptOutState = function(){
    var v = lsGet(OPTOUT_KEY);
    return { blocked: isBlocked(), explicit: v === '1' ? '1' : (v === '0' ? '0' : null), dnt: browserDNT(), umami: !!id };
  };
  window.tmSetOptOut = function(on){ lsSet(OPTOUT_KEY, on ? '1' : '0'); return isBlocked(); };

  // 闸门开着时不注入官方脚本；本机计数仍在每次调用时重查开关
  if (id && !isBlocked()){
    var base = (cfg.URL || 'https://analytics.umami.is').replace(/\/+$/, '');
    var s = document.createElement('script');
    s.async = true;
    s.src = base + '/script.js';
    s.setAttribute('data-website-id', id);
    s.setAttribute('data-auto-track', 'true');
    document.head.appendChild(s);
  }

  window.tmTrack = function (name, props) {
    if (isBlocked()) return false;
    props = props || {};
    try { recordLocal(name, props); } catch (e) {}
    if (!id) return false;
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
    return true;
  };
})();
