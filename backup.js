/* 天赋星图 · 备份与恢复（零依赖，纯前端）
 * 导出与导入共用一套信封，治的是「这里导出的文件，那里读不回来」。
 * 信封 v1 三种：
 *   {type:'talentmap_all',   v:1, ts, data:{'<localStorage 键>': 值}}  —— me.html「导出全部数据」
 *   {type:'talentmap_item',  v:1, ts, key, data}                       —— me.html 单项导出
 *   {type:'talentmap_diary', v:1, ts, entries, exp}                    —— action.html「下载备份」
 * 还兼容两种历史形状：裸数组（早期日记备份）、没有 v 字段的文件。
 * talentmap_preimport 是「导入前快照」，它既不参与导出也不参与导入——否则一次导入会把真正的撤销记录盖掉。
 * 导出时解析不动的值（非 JSON 的裸串）进 rawKeys 名单，导入时原样写回；解析得动的值一律重新序列化。
 *   这样 "0" 这种「带引号的 JSON 标量」和 0 这种「裸标量」都能逐字节还原，不会互相窜。
 * 出错一律抛带 code 的 Error，页面直接把 message 播给用户，不做静默降级。
 */
(function (global) {
  var V = 1;
  var PRE_KEY = 'talentmap_preimport';
  var DIARY_KEY = 'talentmap_diary';
  var EXP_KEY = 'talentmap_exp';

  function err(message, code) {
    var e = new Error(message);
    e.name = 'TMBackupError';
    e.code = code || 'bad_backup';
    return e;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // raw 来自 rawKeys 名单（导出时就读不回 JSON 的裸串）——原样写回；其余一律重新序列化
  function toStored(v, raw) { return raw ? String(v) : JSON.stringify(v); }

  // 任意备份形状 → [{key, value}]，value 就是要落进 localStorage 的字符串
  function normalize(obj) {
    var items = [];
    if (obj === null || obj === undefined || obj === '') throw err('这份文件是空的，没有可恢复的内容。', 'empty');
    if (Array.isArray(obj)) {
      if (!obj.length) throw err('这份文件里没有日记记录（空数组）。', 'empty');
      return [{ key: DIARY_KEY, value: JSON.stringify(obj) }]; // 早期：裸数组就是日记条目
    }
    if (typeof obj !== 'object') throw err('这份文件不是本站认识的备份。', 'unknown_type');
    if (obj.v && obj.v > V) throw err('这份备份的版本是 v' + obj.v + '，比本站能读的 v' + V + ' 新。先更新站点，再回来导入。', 'version');
    var t = obj.type || '';
    if (t === 'talentmap_all') {
      if (!obj.data || typeof obj.data !== 'object') throw err('这份「全部数据」备份里没有数据。', 'empty');
      var u = obj.data['__utm__'], i, raw = {};
      (obj.rawKeys || []).forEach(function (k) { raw[k] = 1; });
      for (i in obj.data) {
        if (!obj.data.hasOwnProperty(i) || i === '__utm__') continue;
        if (i.indexOf('talentmap_') === 0) items.push({ key: i, value: toStored(obj.data[i], raw[i]) });
      }
      if (u && typeof u === 'object') { // 早期格式：UTM 计数被并成一个 __utm__ 包装，里面本来就是裸串
        for (i in u) { if (u.hasOwnProperty(i) && i.indexOf('talentmap_') === 0) items.push({ key: i, value: String(u[i]) }); }
      }
    } else if (t === 'talentmap_item') {
      if (!obj.key || String(obj.key).indexOf('talentmap_') !== 0) throw err('这份单项备份没有可用的键名。', 'bad_key');
      items.push({ key: String(obj.key), value: toStored(obj.data, Array.isArray(obj.rawKeys) && obj.rawKeys.indexOf(obj.key) >= 0) });
    } else if (t === 'talentmap_diary') {
      if (Array.isArray(obj.entries) && obj.entries.length) items.push({ key: DIARY_KEY, value: JSON.stringify(obj.entries) });
      if (Array.isArray(obj.exp)) items.push({ key: EXP_KEY, value: JSON.stringify(obj.exp) });
    } else if (obj.key && String(obj.key).indexOf('talentmap_') === 0) {
      items.push({ key: String(obj.key), value: toStored(obj.data) }); // 没有 type 但形状像单项，收
    } else {
      throw err('认不出这份备份的类型' + (t ? '（' + t + '）' : '') + '。请用「我的星图」页或行动页导出的文件。', 'unknown_type');
    }
    items = items.filter(function (it) { return it.key !== PRE_KEY; });
    if (!items.length) throw err('这份备份里没有任何可恢复的星图数据。', 'empty');
    return items;
  }

  function usable(items) {
    return (items || []).filter(function (it) {
      return it && typeof it.key === 'string' && it.key.indexOf('talentmap_') === 0 && it.key !== PRE_KEY;
    });
  }

  // 写之前先数一遍：多少项是新增、多少项会盖掉本机已有的
  function plan(items) {
    var fresh = 0, over = 0, seen = {}, list = usable(items);
    list.forEach(function (it) {
      if (seen[it.key]) return;
      seen[it.key] = 1;
      if (lsGet(it.key) === null) fresh++; else over++;
    });
    return { fresh: fresh, overwrite: over, total: Object.keys(seen).length, keys: Object.keys(seen) };
  }

  // 写入。写之前把将被触碰的键的当前值整份存成快照，页面据此提供「还原到导入前」
  function apply(items) {
    var list = usable(items);
    if (!list.length) throw err('这份备份里没有本站认得的键。', 'bad_key');
    var snap = {}, ts = Date.now(), i;
    for (i = 0; i < list.length; i++) snap[list[i].key] = lsGet(list[i].key);
    if (!lsSet(PRE_KEY, JSON.stringify({ ts: ts, v: V, data: snap }))) {
      throw err('这台设备的本地存储写不进去（可能是无痕模式，或已存满）。导入没有发生。', 'storage');
    }
    var done = 0, failed = 0;
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.value === null || it.value === undefined) { lsDel(it.key); done++; }
      else if (lsSet(it.key, it.value)) done++;
      else failed++;
    }
    return { written: done, failed: failed, total: list.length, snapshotTs: ts };
  }

  function snapshotInfo() {
    var raw = lsGet(PRE_KEY);
    if (raw === null) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || !o.data) return null;
      var n = Object.keys(o.data).length;
      return n ? { ts: o.ts || 0, keys: n } : null;
    } catch (e) { return null; }
  }

  // 快照里记的是 null 表示「导入前这个键根本不存在」，还原时就要删掉它
  function restore() {
    var raw = lsGet(PRE_KEY);
    if (raw === null) return null;
    var o;
    try { o = JSON.parse(raw); } catch (e) { throw err('导入前快照已经读坏了，没法还原。', 'bad_snapshot'); }
    if (!o || !o.data) return null;
    var n = 0, k;
    for (k in o.data) {
      if (!o.data.hasOwnProperty(k) || k === PRE_KEY) continue;
      if (k.indexOf('talentmap_') !== 0) continue;
      var v = o.data[k];
      if (v === null || v === undefined) lsDel(k); else lsSet(k, String(v));
      n++;
    }
    return { restored: n, ts: o.ts || 0 };
  }

  function dropSnapshot() { lsDel(PRE_KEY); }

  // 手机上存不了文件：整份备份编成一段可复制的文本
  function toCode(obj) {
    var s = JSON.stringify(obj);
    try { return btoa(unescape(encodeURIComponent(s))); }
    catch (e) { throw err('这台设备生成不了备份码（缺 base64 支持）。改用「下载备份」。', 'no_btoa'); }
  }

  function parseText(text) {
    var t = String(text === null || text === undefined ? '' : text).trim();
    if (!t) throw err('还没有粘贴备份码。', 'empty');
    if (/^[\{\[]/.test(t)) {
      try { return JSON.parse(t); } catch (e) { throw err('这段 JSON 读不了，多半是复制时掐头去尾了。整段重新复制再试。', 'bad_json'); }
    }
    var b64 = t.replace(/\s+/g, '');
    try { return JSON.parse(decodeURIComponent(escape(atob(b64)))); }
    catch (e) { throw err('备份码解不开，可能是复制时缺了字符。整段重新复制一次再试。', 'bad_code'); }
  }

  // 收集本站全部本地数据（快照键除外），供「导出全部数据」和备份码共用
  function collectAll() {
    var out = { type: 'talentmap_all', v: V, ts: Date.now(), data: {} };
    var i, k;
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (!k || k.indexOf('talentmap_') !== 0 || k === PRE_KEY) continue;
      var raw = lsGet(k);
      if (raw === null) continue;
      try { out.data[k] = JSON.parse(raw); }
      catch (e) { out.data[k] = raw; (out.rawKeys || (out.rawKeys = [])).push(k); }
    }
    return out;
  }

  global.TMBackup = {
    V: V,
    PRE_KEY: PRE_KEY,
    DIARY_KEY: DIARY_KEY,
    EXP_KEY: EXP_KEY,
    normalize: normalize,
    plan: plan,
    apply: apply,
    snapshotInfo: snapshotInfo,
    restore: restore,
    dropSnapshot: dropSnapshot,
    toCode: toCode,
    parseText: parseText,
    collectAll: collectAll,
    envelope: function (type, extra) {
      var o = { type: type, v: V, ts: Date.now() };
      if (extra) for (var k in extra) { if (extra.hasOwnProperty(k)) o[k] = extra[k]; }
      return o;
    }
  };
})(window);
