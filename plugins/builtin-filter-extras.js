// 内置插件：屏蔽花絮/预告/样片
// 作用：把预告片、花絮、样片（sample）、小体积视频这类"不是正片"的东西挡掉。
// 参数不用改代码：在「插件 → 屏蔽花絮/预告/样片 → 设置」里填，保存即生效。

export const meta = {
  name: "builtin-filter-extras",
  title: "屏蔽花絮 / 预告 / 样片",
  version: "1.2.0",
  description: "拦截标题或文件名中带「预告、花絮、彩蛋、样片、sample、trailer」等字样的资源；文件级再拦截体积过小的视频（多半是样片）。",
  author: "内置",
  priority: 50,
};

// ───── 设置项（在插件详情页填写，不需要改代码） ─────
export const config = {
  keywords: {
    type: "string",
    title: "拦截关键词（正则）",
    desc: "标题 / 文件名 / 消息文本命中它就拦，不区分大小写。",
    default: "预告|花絮|彩蛋|幕后|特辑|样片|片花|\\btrailer\\b|\\bsample\\b|\\bfeaturette\\b|\\bteaser\\b",
    maxLen: 1000,
  },
  minFileSizeMB: {
    type: "number",
    title: "文件级最小体积（MB）",
    desc: "小于这个体积的视频视为样片并拦截；填 0 关闭这条规则。",
    default: 150,
    min: 0,
    max: 100000,
  },
};
// ─────────────────────────────────────────────

let keyRe = /$^/;
let keySrc = null;

function keywordHit(text, src) {
  if (src !== keySrc) {
    keySrc = src;
    if (!src) {
      keyRe = /$^/;
    } else {
      try {
        keyRe = new RegExp(src, "i");
      } catch (e) {
        console.warn("拦截关键词不是合法正则，已停用:", src, String(e));
        keyRe = /$^/;
      }
    }
  }
  return keyRe.test(text);
}

export const hooks = {
  /** @param {import("./host").FilterCtx} ctx */
  "content.filter"(ctx) {
    const { stage, text, file } = ctx.input;

    if (keywordHit(text, String(ctx.config.keywords || ""))) {
      ctx.result.action = "block";
      ctx.result.reason = "非正片（预告/花絮/样片）";
      console.debug(`[${stage}] 拦截非正片:`, text);
      return;
    }

    const minBytes = Math.max(0, Number(ctx.config.minFileSizeMB) || 0) * 1024 * 1024;
    if (stage === "file" && minBytes > 0 && file && file.size > 0 && file.size < minBytes) {
      ctx.result.action = "block";
      ctx.result.reason = `文件过小（${(file.size / 1024 / 1024).toFixed(0)}MB），疑似样片`;
      console.debug("拦截小文件:", file.name, file.size);
    }
  },
};
