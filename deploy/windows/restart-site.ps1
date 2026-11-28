#Requires -RunAsAdministrator
<#
Restarts the public site's Caddy and/or backend, for example after changing the Caddyfile,
.env.production or backend code. A rebuilt frontend (npm run build) needs no restart.

Needs an elevated PowerShell: the start-up tasks run in their own logon session, and stopping
a task ends only its cmd wrapper, not the Caddy or Node process it started.
Usage: .\restart-site.ps1 [-Part All|Backend|Caddy]
#>
param([ValidateSet('All', 'Backend', 'Caddy')][string]$Part = 'All')
$ErrorActionPreference = 'Stop'
$parts = [ordered]@{
  # Matches only the production processes, never `npm run dev` (which runs src\server.js from backend\).
  Backend = @{ Wrapper = 'run-backend\.cmd'; Exe = 'node.exe'; Match = 'backend\\src\\server\.js' }
  Caddy   = @{ Wrapper = 'run-caddy\.cmd'; Exe = 'caddy.exe'; Match = 'deploy\\windows\\Caddyfile' }
}
foreach ($name in $parts.Keys) {
  if ($Part -ne 'All' -and $Part -ne $name) { continue }
  $p = $parts[$name]
  $task = "EWAGuard AI $name"
  Stop-ScheduledTask -TaskPath '\EWAGuard\' -TaskName $task
  $stale = @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match $p.Wrapper }) +
    @(Get-CimInstance Win32_Process -Filter "Name='$($p.Exe)'" | Where-Object { $_.CommandLine -match $p.Match })
  foreach ($process in $stale) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Start-ScheduledTask -TaskPath '\EWAGuard\' -TaskName $task
  Write-Host "$task restarted (stopped $($stale.Count) old process(es))."
}
