param(
  [string]$OdooRoot = "C:\Program Files\Odoo 19.0.20260415",
  [string]$Database = "odoo19_admin",
  [string]$WorkspaceAddonsPath = "C:\Users\User\Desktop\hot tohjilt\onlywebapp\odoo_addons",
  [string]$ServiceName = "odoo-server-19.0",
  [string[]]$Modules = @("hr_custom_mn", "municipal_repair_workflow"),
  [switch]$RestartAfterUpgrade
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "Run this script from an Administrator PowerShell window."
  exit 1
}

$pythonPath = Join-Path $OdooRoot "python\python.exe"
$odooBinPath = Join-Path $OdooRoot "server\odoo-bin"
$configPath = Join-Path $OdooRoot "server\odoo.conf"
$defaultAddonsPath = Join-Path $OdooRoot "server\odoo\addons"

foreach ($path in @($pythonPath, $odooBinPath, $configPath, $defaultAddonsPath, $WorkspaceAddonsPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Error "Required path not found: $path"
    exit 1
  }
}

$addonsPath = "$WorkspaceAddonsPath,$defaultAddonsPath"
$moduleList = ($Modules -join ",")

Write-Output "Stopping service: $ServiceName"
Stop-Service -Name $ServiceName -Force

try {
  Write-Output "Upgrading modules: $moduleList"
  & $pythonPath $odooBinPath `
    -c $configPath `
    --addons-path $addonsPath `
    -d $Database `
    -u $moduleList `
    --stop-after-init

  if ($LASTEXITCODE -ne 0) {
    throw "Odoo module upgrade failed with exit code $LASTEXITCODE"
  }
} finally {
  if ($RestartAfterUpgrade) {
    Write-Output "Starting service: $ServiceName"
    Start-Service -Name $ServiceName
  }
}

Write-Output "Upgrade finished."
