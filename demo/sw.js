// 只读演示版 Service Worker（2.1.0 新壳版）：拦截 api/*，按 demo-data.json 回放；
// 写操作统一 405 + 只读提示。前端 bundle 零改动。
//
// 路由表由 tools/build-demo/record_demo.js 录制（键 = "GET /api/..."，含 query）；
// 匹配顺序：精确 → 去 query 的路径级 → 未命中 404 JSON（页面按接口失败处理，骨架仍在）。
// 子路径部署：作用域可能是 /demo/，故 /api 前缀由 scope 推导。
/* global clients */
const SCOPE_PATH = new URL(self.registration.scope).pathname
const API_BASE = SCOPE_PATH.replace(/\/+$/, '') + '/api/'
const DATA_URL = new URL('demo-data.json', self.registration.scope).href
let ROUTES = null
let BY_PATH = null

const READONLY_MESSAGE = '演示版为只读快照：修改不会生效。下载完整桌面版即可实际填报。'

function canonicalApiPath(pathname, search) {
  if (!pathname.startsWith(API_BASE)) return null
  return '/api/' + pathname.slice(API_BASE.length) + (search || '')
}

async function loadData() {
  if (ROUTES) return
  const response = await fetch(DATA_URL, { cache: 'no-store' })
  const data = await response.json()
  ROUTES = data.routes || {}
  BY_PATH = {}
  for (const [key, value] of Object.entries(ROUTES)) {
    const path = key.split(' ')[1] || ''
    if (!BY_PATH[path]) BY_PATH[path] = value      // 首条（含 query 的原样）作为路径级兜底
  }
}

function matchRoute(method, apiPath) {
  if (!ROUTES) return undefined
  const direct = ROUTES[`${method} ${apiPath}`]
  if (direct !== undefined) return direct
  const bare = apiPath.split('?')[0]
  const byPath = BY_PATH[`${method} ${bare}`]
  if (byPath !== undefined) return byPath
  // 同路径不同 query 的近邻（例：/api/ai/config?scope=project）
  for (const [key, value] of Object.entries(ROUTES)) {
    const [keyMethod, keyPath] = key.split(' ')
    if (keyMethod === method && keyPath.split('?')[0] === bare) return value
  }
  return undefined
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()) })

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  const apiPath = canonicalApiPath(url.pathname, url.search)
  if (!apiPath) return                                  // 静态资源走网络
  if (request.method !== 'GET') {
    event.respondWith(new Response(JSON.stringify({ detail: READONLY_MESSAGE, demo_readonly: true }), {
      status: 405, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }))
    return
  }
  event.respondWith((async () => {
    try {
      await loadData()
    } catch {
      return jsonResponse({ detail: '演示数据未就绪（demo-data.json 加载失败）' }, 503)
    }
    const payload = matchRoute('GET', apiPath)
    if (payload === undefined) return jsonResponse({ detail: '演示快照未包含该接口', demo_missing: true }, 404)
    return jsonResponse(payload)
  })())
})
