[CmdletBinding()]
param(
    [switch]$CleanModules
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$orchestratorDir = Join-Path $repoRoot 'services\orchestrator'
$webDir = Join-Path $repoRoot 'services\web'

Write-Host "Using repo: $repoRoot"

Write-Host "Stopping local npm/node processes running from this repo..."
$repoPattern = [Regex]::Escape($repoRoot)
$targets = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        ($_.Name -in @('node.exe', 'npm.cmd', 'npm.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe')) -and
        ($_.CommandLine -match $repoPattern)
    }

foreach ($proc in $targets) {
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        Write-Host ("Stopped PID {0} ({1})" -f $proc.ProcessId, $proc.Name)
    }
    catch {
        Write-Host ("Could not stop PID {0}: {1}" -f $proc.ProcessId, $_.Exception.Message)
    }
}

Write-Host "Verifying npm cache..."
npm cache verify | Out-Host

if ($CleanModules.IsPresent) {
    Write-Host "Removing service node_modules for clean reinstall..."
    $modulePaths = @(
        (Join-Path $orchestratorDir 'node_modules'),
        (Join-Path $webDir 'node_modules')
    )
    foreach ($modulePath in $modulePaths) {
        if (Test-Path -LiteralPath $modulePath) {
            Remove-Item -LiteralPath $modulePath -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Removed $modulePath"
        }
    }
}

Write-Host "Installing orchestrator dependencies..."
Push-Location $orchestratorDir
npm install | Out-Host
Pop-Location

Write-Host "Installing web dependencies..."
Push-Location $webDir
npm install | Out-Host
Pop-Location

Write-Host "Done."
