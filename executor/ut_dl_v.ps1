param(
  [string]$inst = "ETH-USDT-SWAP",
  [string]$bar = "15m",
  [int]$daysBack = 400,
  [string]$outFile = "C:\Users\asus\.zcode\workspace\default\ut_eth15m_swap_vol.txt"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$needBefore = $nowMs - [long]$daysBack * 86400L * 1000L
$after = $nowMs + 600000L
$rows = New-Object System.Collections.Generic.List[string]
$page = 0
while ($page -lt 600) {
  $url = "https://www.okx.com/api/v5/market/history-candles?instId=$inst&bar=$bar&limit=100&after=$after"
  $r = $null; $ok = $false
  for ($t = 1; $t -le 8 -and -not $ok; $t++) {
    try {
      $r = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0)" } -TimeoutSec 25
      if ($r.code -eq "0") { $ok = $true } else { Start-Sleep -Milliseconds (400 * $t) }
    } catch { Start-Sleep -Milliseconds (400 * $t) }
  }
  if (-not $ok) { Write-Output "DOWNLOAD_FAILED after=$after"; exit 1 }
  $d = @($r.data)
  if ($d.Count -eq 0) { break }
  foreach ($k in $d) { $rows.Add(([string]$k[0]) + " " + ([string]$k[1]) + " " + ([string]$k[2]) + " " + ([string]$k[3]) + " " + ([string]$k[4]) + " " + ([string]$k[5])) }
  $oldest = [long]$d[$d.Count - 1][0]
  $page++
  if ($page % 100 -eq 0) { Write-Output ("pages=" + $page + " bars=" + $rows.Count) }
  if ($oldest -le $needBefore) { break }
  $after = $oldest
  Start-Sleep -Milliseconds 90
}
$map = @{}
foreach ($line in $rows) { $p = $line -split ' '; $map[[long]$p[0]] = $line }
$keys = @($map.Keys) | Sort-Object
$sb = New-Object System.Text.StringBuilder
foreach ($kk in $keys) { [void]$sb.AppendLine($map[$kk]) }
[System.IO.File]::WriteAllText($outFile, $sb.ToString())
Write-Output ("BARS=" + $keys.Count)
Write-Output ("LAST=" + $rows[0])
