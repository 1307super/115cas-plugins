// 内置插件：调试观察器
// 作用：不修改任何结果，只把各个接入点收到的输入和当前结论打印到插件日志。
// 用途：写插件前想看看"系统到底传进来什么数据"时，打开它，去「插件 → 日志」看输出；看完记得关掉（调用很频繁，会刷日志）。
// 想只观察某几个接入点：把下面 WATCH 改成你关心的名字，另存为新版本并启用。

export const meta = {
  name: "builtin-debug-observer",
  title: "调试观察器（只看不改）",
  version: "1.1.0",
  description: "打印每个接入点收到的 ctx.input 和 ctx.result，帮助你了解数据结构、排查规则。不修改任何结果。",
  author: "内置",
  priority: 9999, // 最后执行，看到的是所有插件处理后的最终结论
};

// ───── 配置区 ─────
// 要观察的接入点；全部名称见「接入点」标签。高频的（content.filter / resource.score / title.parse）日志量很大。
const WATCH = [
  "message.links", "message.hint", "message.policy",
  "search.query", "search.results",
  "content.filter", "resource.score", "tv.plan",
  "title.parse", "category.classify", "path.build",
  "notify.format", "event.receive",
];
const MAX_LEN = 1500; // 单条日志最多打印多少字符
// ──────────────────

const short = (v) => {
  const s = JSON.stringify(v);
  if (s === undefined) return "undefined";
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN) + "…(已截断)" : s;
};

export const hooks = {};
for (const name of WATCH) {
  hooks[name] = (ctx) => {
    if (name === "event.receive") console.log("[" + name + "] " + ctx.input.type, short(ctx.input.data));
    else console.log("[" + name + "] input=" + short(ctx.input) + " result=" + short(ctx.result));
  };
}
