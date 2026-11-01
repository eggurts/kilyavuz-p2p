@echo off
chcp 65001 >nul
title Kilyavuz P2P - Ses ve Ekran Paylasimi
cd /d "%~dp0"
echo =========================================================
echo   KILYAVUZ P2P - SUNUCUSUZ SES VE EKRAN PAYLASIMI (1-e-1)
echo =========================================================
echo.
echo Tarayici aciliyor, lutfen bu pencereyi gorusme boyunca kapatmayin...
echo (Mikrofon ve ekran sesi izinleri icin localhost uzerinden acilir.)
echo.
echo Chrome/Edge ozel modda acilir: pencereyi kucultup oyuna gecince
echo yayin FPS'i dusmesin diye arka plan kisitlamalari kapatilir.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir = '%~dp0'.TrimEnd('\'); $http = $null; " ^
  "foreach ($p in @(47823, 47824, 47825, 0)) { " ^
  "  if ($p -eq 0) { $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0); $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop(); } " ^
  "  try { $h = New-Object System.Net.HttpListener; $h.Prefixes.Add('http://localhost:' + $p + '/'); $h.Start(); $http = $h; $port = $p; break } catch { } " ^
  "} " ^
  "if (-not $http) { Write-Host 'Sunucu baslatilamadi!' -ForegroundColor Red; exit 1 } " ^
  "$url = 'http://localhost:' + $port + '/index.html'; " ^
  "Write-Host ('Uygulama calisiyor: ' + $url) -ForegroundColor Green; " ^
  "$cands = @((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'), (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'), (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'), (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')); " ^
  "$browser = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1; " ^
  "$prof = Join-Path $env:LOCALAPPDATA 'KilyavuzP2P\TarayiciProfili'; " ^
  "if ($browser) { " ^
  "  Write-Host ('Tarayici: ' + $browser) -ForegroundColor DarkGray; " ^
  "  Start-Process -FilePath $browser -ArgumentList @(('--app=' + $url), ('--user-data-dir=' + $prof), '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', '--no-first-run', '--no-default-browser-check') " ^
  "} else { Start-Process $url } " ^
  "while ($http.IsListening) { " ^
  "  try { " ^
  "    $ctx = $http.GetContext(); $req = $ctx.Request; $res = $ctx.Response; " ^
  "    $rel = $req.Url.LocalPath.TrimStart('/'); " ^
  "    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }; " ^
  "    $target = Join-Path $dir ($rel -replace '/', [System.IO.Path]::DirectorySeparatorChar); " ^
  "    if (-not (Test-Path $target -PathType Leaf)) { $target = Join-Path $dir 'index.html' }; " ^
  "    $bytes = [System.IO.File]::ReadAllBytes($target); " ^
  "    $ext = [System.IO.Path]::GetExtension($target).ToLower(); " ^
  "    $mime = 'text/html; charset=utf-8'; " ^
  "    if ($ext -eq '.js') { $mime = 'application/javascript; charset=utf-8' } " ^
  "    elseif ($ext -eq '.css') { $mime = 'text/css; charset=utf-8' } " ^
  "    elseif ($ext -eq '.json') { $mime = 'application/json' }; " ^
  "    $res.ContentType = $mime; " ^
  "    $res.Headers.Add('Cache-Control', 'no-store'); " ^
  "    $res.ContentLength64 = $bytes.Length; " ^
  "    $res.OutputStream.Write($bytes, 0, $bytes.Length); " ^
  "    $res.OutputStream.Close(); " ^
  "  } catch { } " ^
  "}"
pause
