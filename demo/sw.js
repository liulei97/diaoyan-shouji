// 只读演示版 Service Worker（2026-11-06）：拦截 api/*，按 demo-data.json 回放；
// 写操作统一 405 + 只读提示。前端 bundle 零改动。
//
// 子路径部署适配（2026-11-06）：演示版可能挂在 GitHub Pages 项目页
// https://liulei97.github.io/diaoyan-shouji/demo/ 下，此时 SW 作用域是
// /diaoyan-shouji/demo/，只能拦到该前缀下的请求。所以 api 前缀由 scope 推导，
// 路由表内部仍用 /api/... 的规范键（与导出脚本一致）；挂根路径时前缀退化为 /api/。
/* global clients */
const SCOPE_PATH = new URL(self.registration.scope).pathname          // '/demo/' 或 '/'
const API_BASE = SCOPE_PATH.replace(/\/+$/, '') + '/api/'             // '/demo/api/' 或 '/api/'
const DATA_URL = new URL('demo-data.json', self.registration.scope).href
let ROUTES = null
let PID = null

const READONLY_MESSAGE = '演示版为只读快照：修改不会生效。下载完整桌面版即可实际填报。'

// 把作用域内的 /demo/api/xxx 还原成路由键用的 /api/xxx
function canonicalApiPath(pathname) {
  if (!pathname.startsWith(API_BASE)) return null
  return '/api/' + pathname.slice(API_BASE.length)
}

async function loadData() {
  if (ROUTES) return
  const response = await fetch(DATA_URL, { cache: 'no-store' })
  const data = await response.json()
  PID = data.pid
  ROUTES = data.routes
}

// 路由匹配：先精确（含 {pid} 替换），未命中时未带尾斜杠的 /api/projects/{pid} 前缀
// 类接口（如 map-config / report-marks 等没导出的）回 405 不合适——回 404 JSON，
// 前端按「接口失败」处理但页面骨架仍在。
function matchRoute(method, apiPath) {
  if (!ROUTES) return undefined
  const direct = ROUTES[`${method} ${apiPath}`]
  if (direct !== undefined) return direct
  if (PID) {
    const withPid = `${method} ${apiPath.replace('/api/projects/demo-pid', `/api/projects/${PID}`)}`
    if (ROUTES[withPid] !== undefined) return ROUTES[withPid]
  }
  return undefined
}

function readonlyResponse() {
  return new Response(JSON.stringify({ detail: READONLY_MESSAGE, demo_readonly: true }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await loadData()
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // API：读回放 / 写拒绝
  const apiPath = canonicalApiPath(url.pathname)
  if (apiPath) {
    event.respondWith((async () => {
      try { await loadData() } catch { /* 数据坏了就全走 405/404 */ }
      if (request.method !== 'GET') {
        // 登录请求给假成功（演示访客），其余写操作拒绝
        if (apiPath === '/api/auth/login') {
          const body = ROUTES?.['POST /api/auth/login'] || {}
          return new Response(JSON.stringify(body), {
            status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' },
          })
        }
        return readonlyResponse()
      }
      const hit = matchRoute('GET', apiPath)
      if (hit !== undefined) {
        return new Response(JSON.stringify(hit), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' },
        })
      }
      return new Response(JSON.stringify({ detail: '演示版未收录该接口（只读快照）', demo_missing: true }), {
        status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    })())
    return
  }
  // 页面资源：cache-first（演示版是静态快照，改版随缓存名翻新）
  if (request.method === 'GET') {
    event.respondWith(caches.open('demo-static-v1').then(async cache => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    }))
  }
})
