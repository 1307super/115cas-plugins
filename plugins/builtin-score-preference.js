// 内置插件：资源偏好加分
// 作用：在内置评分（分辨率×100、编码×50、片源×30 …）基础上，按你的偏好加减分，影响订阅自动选哪个资源。
// 默认值是一组常见偏好，按需修改「配置区」。分数只影响先后顺序，不会拦截资源。

export const meta = {
  name: "builtin-score-preference",
  title: "资源偏好加分",
  version: "1.2.0",
  description: "按关键词给资源加减分（默认：杜比视界、HDR、中字加分；枪版、过大的文件减分）。",
  author: "内置",
  priority: 100,
};

// ───── 配置区 ─────
// 关键词规则：命中标题/备注/资源备注即加上 score（负数为减分）
const RULES = [
  { name: "杜比视界", pattern: /杜比视界|dolby ?vision|\bDV\b|\bDoVi\b/i, score: 200 },
  { name: "HDR", pattern: /HDR10\+?|\bHDR\b/i, score: 80 },
  { name: "中文字幕", pattern: /中字|中文字幕|简中|繁中|双语/, score: 120 },
  { name: "国语/粤语音轨", pattern: /国语|国粤|粤语|双音轨/, score: 30 },
  { name: "枪版/抢先", pattern: /枪版|抢先|\bCAM\b|\bTS\b|\bHDTC\b/i, score: -1000 },
];
// ──────────────────

// ───── 设置项（在插件详情页填写，不需要改代码） ─────
export const config = {
  maxSizeGB: { type: "number", title: "体积上限（GB）", desc: "超过这个体积减分；填 0 关闭。", default: 100, min: 0, max: 100000 },
  oversizePenalty: { type: "number", title: "超体积扣分", desc: "负数即扣分。", default: -150, min: -100000, max: 100000 },
};
// ─────────────────────────────────────────────

export const hooks = {
  /** @param {import("./host").ScoreCtx} ctx */
  "resource.score"(ctx) {
    const r = ctx.input.resource;
    const text = [r.title, r.note, r.remark].join(" ");
    const hits = [];

    for (const rule of RULES) {
      if (rule.pattern.test(text)) {
        ctx.result += rule.score;
        hits.push(`${rule.name}${rule.score > 0 ? "+" : ""}${rule.score}`);
      }
    }
    const maxSizeGB = Number(ctx.config.maxSizeGB) || 0;
    const penalty = Number(ctx.config.oversizePenalty) || 0;
    if (maxSizeGB > 0 && penalty !== 0 && r.size > maxSizeGB * 1024 ** 3) {
      ctx.result += penalty;
      hits.push(`体积过大${penalty}`);
    }
    if (hits.length > 0) {
      console.debug(`${r.title} → ${hits.join(", ")}（内置分 ${ctx.input.builtin}）`);
    }
  },
};
