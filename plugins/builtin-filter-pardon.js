// 内置插件：黑名单特赦
// 作用：内置黑白名单（胶囊）拦下的资源，如果命中「特赦关键词」就放行。
// 典型场景：黑名单里写了 2160p（嫌 4K 太大），但「内封中字」的 4K 你还是想要。
// 参数不用改代码：在「插件 → 黑名单特赦 → 设置」里填，保存即生效。

export const meta = {
  name: "builtin-filter-pardon",
  title: "黑名单特赦",
  version: "1.2.0",
  description: "被内置黑名单拦截、但文本命中特赦关键词（默认：内封中字/中英双字）的资源会被放行；可限定只对某些分类生效。",
  author: "内置",
  priority: 900, // 排在靠后：越靠后说了越算，确保能推翻前面的拦截
};

// ───── 设置项（在插件详情页填写，不需要改代码） ─────
export const config = {
  pardon: {
    type: "string",
    title: "特赦关键词（正则）",
    desc: "文本命中它就放行；不区分大小写。留空表示不做任何特赦。",
    default: "内封中字|内嵌中字|中英双字|简繁中字",
    maxLen: 500,
  },
  categories: {
    type: "multiselect",
    title: "只在这些分类生效",
    desc: "不选 = 所有分类都特赦。",
    options: ["国产剧", "欧美剧", "日韩剧", "动漫", "国产电影", "欧美电影", "日韩电影", "纪录片", "综艺"],
    default: [],
  },
  onlyBlacklist: {
    type: "boolean",
    title: "只特赦「黑名单」命中",
    desc: "关闭后，「白名单未命中」被拦下的资源也一并特赦。",
    default: true,
  },
};
// ─────────────────────────────────────────────

// 正则按设置值缓存（只在值变化时重新编译；编译失败则停用并告警一次）。
let pardonRe = /$^/;
let pardonSrc = null;

function pardonHit(text, src) {
  if (src !== pardonSrc) {
    pardonSrc = src;
    if (!src) {
      pardonRe = /$^/;
    } else {
      try {
        pardonRe = new RegExp(src, "i");
      } catch (e) {
        console.warn("特赦关键词不是合法正则，已停用:", src, String(e));
        pardonRe = /$^/;
      }
    }
  }
  return pardonRe.test(text);
}

export const hooks = {
  /** @param {import("./host").FilterCtx} ctx */
  "content.filter"(ctx) {
    if (ctx.result.action !== "block") return; // 本来就没拦，什么都不用做

    const { text, category, builtin } = ctx.input;
    const { categories, onlyBlacklist } = ctx.config;
    if (onlyBlacklist && builtin.kind !== "blacklist") return;
    if (categories.length > 0 && !categories.includes(category)) return;

    if (pardonHit(text, String(ctx.config.pardon || ""))) {
      console.log(`特赦，原拦截规则: ${builtin.pattern || ctx.result.reason}`);
      ctx.result.action = "pass";
      ctx.result.reason = "特赦：命中特赦关键词";
    }
  },
};
