[CmdletBinding()]
param(
    [string]$HostAlias = 'open-antigravity-vps',
    [string]$RemotePath = '/opt/open-antigravity',
    [switch]$Status,
    [switch]$Sync,
    [switch]$Deploy,
    [switch]$DeployTunnel,
    [switch]$UseSudo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Run-External {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

function Build-RemoteCommand {
    param(
        [Parameter(Mandatory = $true)][string]$CommandText,
        [switch]$UseSudo
    )

    if ($UseSudo.IsPresent) {
        return "sudo -n bash -lc '$CommandText'"
    }
    return "bash -lc '$CommandText'"
}

function Truncate-Value {
    param(
        [string]$Value,
        [int]$MaxLength = 180
    )

    if ([string]::IsNullOrEmpty($Value)) {
        return ''
    }

    if ($Value.Length -le $MaxLength) {
        return $Value
    }

    return $Value.Substring(0, $MaxLength - 3) + '...'
}

function Show-LocalRuntimeStatus {
    Write-Host "=== Local runtime snapshot ==="

    $watchPorts = @(3000, 3100, 4000, 4100, 11434, 13100)
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $watchPorts -contains $_.LocalPort } |
        Sort-Object LocalPort, LocalAddress

    if (-not $listeners) {
        Write-Host "No listeners detected on ports: $($watchPorts -join ', ')"
    }
    else {
        $processById = @{}
        $uniqueProcessIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $uniqueProcessIds) {
            try {
                $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction Stop
                $processById[$processId] = [PSCustomObject]@{
                    Name = $process.Name
                    Command = Truncate-Value -Value $process.CommandLine
                }
            }
            catch {
                $processById[$processId] = [PSCustomObject]@{
                    Name = '(unknown)'
                    Command = '(unavailable)'
                }
            }
        }

        $rows = foreach ($listener in $listeners) {
            $processInfo = $processById[$listener.OwningProcess]
            [PSCustomObject]@{
                Address = $listener.LocalAddress
                Port = $listener.LocalPort
                PID = $listener.OwningProcess
                Process = $processInfo.Name
                Command = $processInfo.Command
            }
        }

        $rows | Format-Table -AutoSize
    }

    Write-Host ""
    Write-Host "[local health checks]"
    $healthUrls = @(
        'http://127.0.0.1:3000/health',
        'http://127.0.0.1:3100/health',
        'http://127.0.0.1:4000/health',
        'http://127.0.0.1:4100/health',
        'http://127.0.0.1:11434/api/tags',
        'http://127.0.0.1:13100/health'
    )

    foreach ($healthUrl in $healthUrls) {
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec 5 -UseBasicParsing
            Write-Host "OK   $healthUrl (HTTP $($response.StatusCode))"
        }
        catch {
            Write-Host "FAIL $healthUrl ($($_.Exception.Message))"
        }
    }
}

function Show-RemoteRuntimeStatus {
    param(
        [Parameter(Mandatory = $true)][string]$HostAlias,
        [switch]$UseSudo
    )

    Write-Host ""
    Write-Host "=== Remote runtime snapshot ($HostAlias) ==="
    $identityCmd = Build-RemoteCommand -CommandText 'hostname; whoami; uptime' -UseSudo:$UseSudo.IsPresent
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $identityCmd)

    Write-Host ""
    Write-Host "[listeners]"
    $listenersCmd = Build-RemoteCommand -CommandText 'ss -ltnp | grep -E -e ":3000" -e ":3100" -e ":4000" -e ":4100" -e ":80" -e ":443" || true' -UseSudo:$UseSudo.IsPresent
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $listenersCmd)

    Write-Host ""
    Write-Host "[open-antigravity containers]"
    $containersCmd = Build-RemoteCommand -CommandText 'docker ps | grep open-antigravity || true' -UseSudo:$UseSudo.IsPresent
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $containersCmd)

    Write-Host ""
    Write-Host "[open-antigravity health]"
    $orchestratorHealthCmd = Build-RemoteCommand -CommandText 'curl -fsS http://127.0.0.1:4100/health || true' -UseSudo:$UseSudo.IsPresent
    $webHealthCmd = Build-RemoteCommand -CommandText 'curl -fsS http://127.0.0.1:3100/health || true' -UseSudo:$UseSudo.IsPresent
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $orchestratorHealthCmd)
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $webHealthCmd)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Write-Host "Checking SSH connectivity to '$HostAlias'..."
Run-External -FilePath 'ssh' -Arguments @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', $HostAlias, 'echo VPS_OK')

$hasRemoteActions = $Sync.IsPresent -or $Deploy.IsPresent -or $DeployTunnel.IsPresent

if (-not $Status.IsPresent -and -not $hasRemoteActions) {
    Write-Host "Connection is configured. Use -Status, -Sync, -Deploy, and/or -DeployTunnel for remote actions."
    exit 0
}

if ($Status.IsPresent) {
    Show-LocalRuntimeStatus
    Show-RemoteRuntimeStatus -HostAlias $HostAlias -UseSudo:$UseSudo.IsPresent
}

if (-not $hasRemoteActions) {
    Write-Host "Status snapshot complete."
    exit 0
}

$tempTar = Join-Path $env:TEMP ("open-antigravity-sync-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tar')
$remoteTar = "/tmp/open-antigravity-sync-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + ".tar"

if ($Sync.IsPresent -or $Deploy.IsPresent -or $DeployTunnel.IsPresent) {
    Write-Host "Creating project archive from $repoRoot..."
    Run-External -FilePath 'tar' -Arguments @(
        '-cf',
        $tempTar,
        '--exclude=.git',
        '--exclude=node_modules',
        '--exclude=.env',
        '-C',
        $repoRoot,
        '.'
    )

    Write-Host "Uploading archive to '$HostAlias'..."
    Run-External -FilePath 'scp' -Arguments @('-q', $tempTar, ($HostAlias + ':' + $remoteTar))

    Write-Host "Extracting archive to '$RemotePath'..."
    $extractCmd = "set -e; mkdir -p $RemotePath; tar -xf $remoteTar -C $RemotePath; rm -f $remoteTar"
    $remoteExtractCmd = Build-RemoteCommand -CommandText $extractCmd -UseSudo:$UseSudo.IsPresent
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $remoteExtractCmd)
}

if ($Deploy.IsPresent -or $DeployTunnel.IsPresent) {
    Write-Host "Starting services on VPS with docker compose..."
    if ($DeployTunnel.IsPresent) {
        $tokenCheckCmd = "set -e; cd $RemotePath; if [ ! -f .env ]; then cp .env.example .env; fi; if ! grep -q ""^TUNNEL_TOKEN=."" .env; then echo ""TUNNEL_TOKEN is not set in $RemotePath/.env"" >&2; exit 2; fi"
        $remoteTokenCheckCmd = Build-RemoteCommand -CommandText $tokenCheckCmd -UseSudo:$UseSudo.IsPresent
        Run-External -FilePath 'ssh' -Arguments @($HostAlias, $remoteTokenCheckCmd)
    }
    $composeCmd = "docker compose up -d --build --force-recreate"
    if ($DeployTunnel.IsPresent) {
        $composeCmd = "docker compose --profile tunnel up -d --build --force-recreate"
    }
    $deployCmd = "set -e; cd $RemotePath; if [ ! -f .env ]; then cp .env.example .env; fi; $composeCmd"
    $remoteDeployCmd = Build-RemoteCommand -CommandText $deployCmd -UseSudo:$UseSudo.IsPresent
    Run-External -FilePath 'ssh' -Arguments @($HostAlias, $remoteDeployCmd)
}

if (Test-Path -LiteralPath $tempTar) {
    Remove-Item -LiteralPath $tempTar -Force
}

Write-Host "Done."
