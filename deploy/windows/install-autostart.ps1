#Requires -RunAsAdministrator
<#
One-time setup for the public EWAGuard AI site. Run in an elevated PowerShell.

1. Installs the cloudflared Windows service. Copy the "cloudflared.exe service install ..."
   command from the Cloudflare dashboard first; the tunnel token is read from the clipboard,
   never printed or logged, and the clipboard is cleared afterwards.
2. Registers two start-up tasks (Caddy and the backend). They run as your own account
   without elevation, not as SYSTEM, and start even when nobody is signed in.

Re-running is safe: an existing cloudflared service is kept and the tasks are replaced.
#>
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'install-autostart.log'
function Write-Step([string]$message) {
  $line = '{0:u} {1}' -f (Get-Date).ToUniversalTime(), $message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

try {
  Write-Step 'Setup started.'

  # 1. Tunnel connector as a Windows service.
  $cloudflared = Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'
  if (-not (Test-Path $cloudflared)) { $cloudflared = Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe' }
  if (-not (Test-Path $cloudflared)) { throw 'cloudflared is not installed.' }
  if (Get-Service -Name cloudflared -ErrorAction SilentlyContinue) {
    Write-Step 'cloudflared service already installed; kept as is.'
  } else {
    $match = [regex]::Match((Get-Clipboard -Raw), 'eyJ[A-Za-z0-9+/_-]+={0,2}')
    if (-not $match.Success) { throw 'No tunnel token on the clipboard. Copy the install command from the Cloudflare dashboard.' }
    Set-Clipboard -Value ' '
    # cloudflared logs progress on stderr; Windows PowerShell would otherwise treat that as a failure.
    $ErrorActionPreference = 'Continue'
    & $cloudflared service install $match.Value *> $null
    $installExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($installExit -ne 0) { throw "cloudflared service install failed (exit code $installExit)." }
    Write-Step 'cloudflared service installed; clipboard cleared.'
  }
  Set-Service -Name cloudflared -StartupType Automatic
  if ((Get-Service -Name cloudflared).Status -ne 'Running') { Start-Service -Name cloudflared }
  Write-Step ('cloudflared service: {0}, {1}.' -f (Get-Service cloudflared).Status, (Get-Service cloudflared).StartType)

  # 2. Start-up tasks for Caddy and the backend, as this user (S4U: no stored password, no network shares).
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Delay = 'PT30S'
  $cmd = Join-Path $env:SystemRoot 'System32\cmd.exe'
  $tasks = [ordered]@{
    'Backend' = 'run-backend.cmd'
    'Caddy'   = 'run-caddy.cmd'
  }
  foreach ($name in $tasks.Keys) {
    $script = Join-Path $PSScriptRoot $tasks[$name]
    $action = New-ScheduledTaskAction -Execute $cmd -Argument "/c `"$script`"" -WorkingDirectory $root
    Register-ScheduledTask -TaskPath '\EWAGuard\' -TaskName "EWAGuard AI $name" -Action $action -Trigger $trigger `
      -Principal $principal -Settings $settings -Description "Keeps the public EWAGuard AI site running ($name)." -Force | Out-Null
    Start-ScheduledTask -TaskPath '\EWAGuard\' -TaskName "EWAGuard AI $name"
    Write-Step "Task 'EWAGuard AI $name' registered for $user and started."
  }
  Write-Step 'Setup finished.'
} catch {
  Write-Step ("Setup failed: {0}" -f $_.Exception.Message)
  exit 1
}
