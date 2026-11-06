# 调研手记 · 只读演示版 本地静态服务器（无 Python 兜底）
# 用途：Windows 自带 PowerShell 起一个只读 http 服务，供演示版页面运行
#      （演示版靠 Service Worker 回放接口，file:// 下不可用，必须走 http）
param([int]$Port = 8899)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "[错误] 端口 $Port 起不来：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "       换个端口再试，或确认没有别的程序占着。"
  exit 1
}

Write-Host ""
Write-Host "  调研手记 · 只读演示版" -ForegroundColor Cyan
Write-Host "  http://localhost:$Port/" -ForegroundColor Green
Write-Host "  关掉本窗口即停止。"
Write-Host ""

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $full = Join-Path $root $rel
    $resolved = [System.IO.Path]::GetFullPath($full)
    # 目录穿越防护：只允许 demo 目录内的文件
    if (-not $resolved.StartsWith([System.IO.Path]::GetFullPath($root), 'OrdinalIgnoreCase')) {
      $ctx.Response.StatusCode = 403
      $ctx.Response.Close()
      continue
    }
    if (Test-Path -LiteralPath $resolved -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($resolved)
      $ext = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
      $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
      $ctx.Response.ContentType = 'text/plain; charset=utf-8'
      $ctx.Response.OutputStream.Write($body, 0, $body.Length)
    }
    $ctx.Response.Close()
  } catch {
    # 浏览器取消请求等噪声，忽略继续服务
  }
}
