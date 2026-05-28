param(
  [string]$ConfigPath = "C:\Program Files\Odoo 19.0.20260415\server\odoo.conf",
  [string]$WorkspaceAddonsPath = "C:\Users\User\Desktop\hot tohjilt\onlywebapp\odoo_addons",
  [string]$ServiceName = "odoo-server-19.0",
  [switch]$Restart
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "Run this script from an Administrator PowerShell window."
  exit 1
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  Write-Error "Odoo config not found: $ConfigPath"
  exit 1
}
if (-not (Test-Path -LiteralPath $WorkspaceAddonsPath)) {
  Write-Error "Workspace addons path not found: $WorkspaceAddonsPath"
  exit 1
}

$backupPath = "$ConfigPath.codex-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $ConfigPath -Destination $backupPath

$content = Get-Content -LiteralPath $ConfigPath -Raw
$addonsLine = ($content -split "`r?`n" | Where-Object { $_ -match '^\s*addons_path\s*=' } | Select-Object -First 1)
if (-not $addonsLine) {
  Write-Error "addons_path line not found in $ConfigPath"
  exit 1
}

$currentAddonsValue = ($addonsLine -split '=', 2)[1].Trim()
$paths = $currentAddonsValue -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$alreadyPresent = $paths | Where-Object { [System.IO.Path]::GetFullPath($_).TrimEnd('\').ToLowerInvariant() -eq [System.IO.Path]::GetFullPath($WorkspaceAddonsPath).TrimEnd('\').ToLowerInvariant() }

if (-not $alreadyPresent) {
  $newAddonsLine = "addons_path = $WorkspaceAddonsPath,$currentAddonsValue"
  $content = [regex]::Replace($content, '(?m)^\s*addons_path\s*=.*$', $newAddonsLine, 1)
  Set-Content -LiteralPath $ConfigPath -Value $content -NoNewline
}

Write-Output "Config backup: $backupPath"
Write-Output ((Get-Content -LiteralPath $ConfigPath | Select-String -Pattern '^\s*addons_path\s*=').Line)

if ($Restart) {
  Restart-Service -Name $ServiceName -Force
  Write-Output "Restarted service: $ServiceName"
}
