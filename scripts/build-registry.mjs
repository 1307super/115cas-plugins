#!/usr/bin/env node
/**
 * 扫描 plugins/ 目录，提取插件元信息、计算文件 SHA256，自动生成根目录的 registry.json。
 * 零第三方依赖，Node.js 18+ 直接运行：
 *   node scripts/build-registry.mjs
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = process.cwd()
const PLUGINS_DIR = path.join(ROOT, 'plugins')
const REPO_CONFIG_PATH = path.join(ROOT, 'repo.json')
const REGISTRY_PATH = path.join(ROOT, 'registry.json')

const ALLOWED_EXTS = new Set(['.js', '.mjs', '.ts', '.zip', '.enc'])

function readJSONIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function walkPluginFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkPluginFiles(full))
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (ALLOWED_EXTS.has(ext) && !entry.name.endsWith('.meta.json')) {
        out.push(full)
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/**
 * 从源码中定位匹配的花括号对象字面量（跳过字符串、模板字符串与注释）。
 */
function extractBracedObject(src, startIdx) {
  const open = src.indexOf('{', startIdx)
  if (open === -1) return null
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    const next = src[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inSingle) {
      if (!escaped && ch === "'") inSingle = false
      escaped = !escaped && ch === '\\'
      continue
    }
    if (inDouble) {
      if (!escaped && ch === '"') inDouble = false
      escaped = !escaped && ch === '\\'
      continue
    }
    if (inTemplate) {
      if (!escaped && ch === '`') inTemplate = false
      escaped = !escaped && ch === '\\'
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (ch === "'") { inSingle = true; escaped = false; continue }
    if (ch === '"') { inDouble = true; escaped = false; continue }
    if (ch === '`') { inTemplate = true; escaped = false; continue }

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return null
}

function evalObjectLiteral(literal) {
  return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 200 })
}

/**
 * 从 Casby 原生插件源码（export const meta = {...}）提取元信息。
 */
function extractCasbyMeta(src) {
  const re = /\bexport\s+(?:const|let|var)\s+meta\s*(?::[^=]+)?=/
  const m = re.exec(src)
  if (!m) return null
  const objText = extractBracedObject(src, m.index + m[0].length)
  if (!objText) return null
  try {
    const obj = evalObjectLiteral(objText)
    return obj && typeof obj === 'object' ? obj : null
  } catch (err) {
    throw new Error(`解析 export const meta 失败: ${err.message}`)
  }
}

/**
 * 兜底：从 ForwardWidget（WidgetMetadata = {...}）提取基础元信息。
 */
function extractForwardMeta(src) {
  const re = /\bWidgetMetadata\s*=/
  const m = re.exec(src)
  if (!m) return null
  const objText = extractBracedObject(src, m.index + m[0].length)
  if (!objText) return null
  try {
    const obj = evalObjectLiteral(objText)
    if (!obj || typeof obj !== 'object') return null
    const rawId = String(obj.id || '').trim()
    return {
      name: rawId ? (rawId.startsWith('fw-') ? rawId : `fw-${rawId}`) : '',
      title: String(obj.title || '').trim(),
      version: String(obj.version || '').trim(),
      author: String(obj.author || '').trim(),
      description: String(obj.description || '').trim(),
      category: '内容源',
      tags: ['内容源', 'ForwardWidget'],
    }
  } catch {
    return null
  }
}

function inferTagsFromSource(src) {
  const tags = new Set()
  if (/\bexport\s+(?:const|let|var)\s+source\b/.test(src)) tags.add('内容源')
  if (/["']content\.filter["']/.test(src)) tags.add('content.filter')
  if (/["']resource\.score["']/.test(src)) tags.add('resource.score')
  if (/["']search\.source["']/.test(src)) tags.add('search.source')
  if (/["']playback\.decide["']/.test(src)) tags.add('playback.decide')
  if (/["']notify\.format["']/.test(src)) tags.add('notify.format')
  if (/["']event\.receive["']/.test(src)) tags.add('event.receive')
  return [...tags]
}

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function main() {
  const repoCfg = readJSONIfExists(REPO_CONFIG_PATH, {})
  const prevRegistry = readJSONIfExists(REGISTRY_PATH, null)
  const prevById = new Map()
  if (prevRegistry && Array.isArray(prevRegistry.plugins)) {
    for (const p of prevRegistry.plugins) {
      if (p && p.id) prevById.set(p.id, p)
    }
  }

  const overrides = (repoCfg && repoCfg.overrides && typeof repoCfg.overrides === 'object')
    ? repoCfg.overrides
    : {}

  const files = walkPluginFiles(PLUGINS_DIR)
  const seenNames = new Set()
  const plugins = []

  for (const filePath of files) {
    const relPosix = './' + path.relative(ROOT, filePath).split(path.sep).join('/')
    const ext = path.extname(filePath).toLowerCase()
    const baseNoExt = filePath.slice(0, filePath.length - ext.length)
    const sidecar = readJSONIfExists(`${baseNoExt}.meta.json`, {})

    let parsed = {}
    let srcText = ''
    if (ext === '.js' || ext === '.mjs' || ext === '.ts') {
      srcText = fs.readFileSync(filePath, 'utf8')
      parsed = extractCasbyMeta(srcText) || extractForwardMeta(srcText) || {}
    }

    const name = cleanString(sidecar.name || parsed.name)
    const id = cleanString(sidecar.id || name)
    const version = cleanString(sidecar.version || parsed.version)
    if (!name || !version) {
      throw new Error(
        `插件 ${relPosix} 缺少必填字段 name 或 version` +
        (ext === '.zip' || ext === '.enc' ? '（.zip / .enc 文件请提供同名 .meta.json）' : ''),
      )
    }
    if (seenNames.has(name)) {
      throw new Error(`发现重复插件名 "${name}"（文件：${relPosix}）`)
    }
    seenNames.add(name)

    const ov = overrides[name] || overrides[id] || {}
    const prev = prevById.get(id) || {}
    const sha256 = sha256File(filePath)

    const tags = Array.isArray(ov.tags)
      ? ov.tags
      : Array.isArray(sidecar.tags)
        ? sidecar.tags
        : Array.isArray(parsed.tags)
          ? parsed.tags
          : inferTagsFromSource(srcText)

    const item = {
      id,
      name,
      title: cleanString(ov.title || sidecar.title || parsed.title || name),
      version,
      author: cleanString(ov.author || sidecar.author || parsed.author),
      description: cleanString(ov.description || sidecar.description || parsed.description),
      category: cleanString(ov.category || sidecar.category || parsed.category || prev.category),
      tags,
      changelog: cleanString(ov.changelog || sidecar.changelog || parsed.changelog || (prev.version === version ? prev.changelog : '')),
      url: relPosix,
      sha256,
    }

    const minHost = cleanString(ov.minHostVersion || sidecar.minHostVersion || parsed.minHostVersion)
    if (minHost) item.minHostVersion = minHost

    // 清理空的可选字段，让生成的 JSON 简洁易读。
    for (const k of ['author', 'description', 'category', 'changelog']) {
      if (!item[k]) delete item[k]
    }
    if (!item.tags.length) delete item.tags

    plugins.push(item)
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name))

  const nextCore = {
    schemaVersion: 1,
    name: cleanString(repoCfg.name) || 'Casby 插件仓库',
    description: cleanString(repoCfg.description),
    homepage: cleanString(repoCfg.homepage),
    plugins,
  }
  if (!nextCore.description) delete nextCore.description
  if (!nextCore.homepage) delete nextCore.homepage

  // 幂等比较：如果除 updatedAt 外内容完全没变，保持原有 updatedAt，避免无意义 commit。
  const prevComparable = prevRegistry ? { ...prevRegistry } : null
  if (prevComparable) delete prevComparable.updatedAt
  const changed = !prevComparable || JSON.stringify(prevComparable) !== JSON.stringify(nextCore)

  const manifest = {
    schemaVersion: nextCore.schemaVersion,
    name: nextCore.name,
    ...(nextCore.description ? { description: nextCore.description } : {}),
    ...(nextCore.homepage ? { homepage: nextCore.homepage } : {}),
    updatedAt: changed ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') : prevRegistry.updatedAt,
    plugins: nextCore.plugins,
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`已生成 registry.json：共 ${plugins.length} 个插件${changed ? '（有变更）' : '（无变更）'}`)
}

main()
