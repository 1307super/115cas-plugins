# 115CAS / Casby 官方插件仓库

本仓库是 115CAS（Casby）内置官方插件源，客户端会自动从以下地址拉取清单：

```text
https://raw.githubusercontent.com/1307super/115cas-plugins/main/registry.json
```

## 目录结构

```text
.
├── .github/workflows/build-registry.yml  # push 后自动重新计算 SHA256 并更新 registry.json
├── plugins/                              # 存放所有插件源码（.js / .ts / .zip / .enc）
├── repo.json                             # 仓库元信息与可选插件覆盖字段（分类/标签/更新日志等）
├── scripts/build-registry.mjs            # 清单自动生成脚本（零依赖）
└── registry.json                         # 自动生成的插件清单（无需手动编辑）
```

## 发布 / 更新插件流程

以后**不需要手算 SHA256 或手改 `registry.json`**：

1. 新增插件：直接把 `.js` / `.ts` 文件放进 `plugins/` 目录（确保文件内有 `export const meta = { name, version, title, description, author }`）。
2. 更新插件：修改 `plugins/` 下对应插件代码，把里面的 `meta.version` 改大（例如 `1.2.0` → `1.3.0`）；如需写更新日志或分类标签，可在 `repo.json` 的 `overrides` 或同名 `.meta.json` 中填写 `changelog` / `category` / `tags` / `minHostVersion`。
3. `git push` 到 `main` 分支后，GitHub Actions 会自动运行 `node scripts/build-registry.mjs`，重新计算所有文件的 `sha256` 并提交更新后的 `registry.json`。

如需本地预览生成结果，也可以直接运行：

```bash
node scripts/build-registry.mjs
```
