[CmdletBinding()]
param(
    [string]$SourcePath = 'D:\Dev\global.env',
    [string]$LocalEnvPath = '',
    [string]$HostAlias = 'open-antigravity-vps',
    [string]$RemoteEnvPath = '/opt/open-antigravity/.env',
    [switch]$SkipLocal,
    [switch]$SkipRemote,
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

function Parse-EnvFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $map
    }

    $lines = Get-Content -LiteralPath $Path
    foreach ($line in $lines) {
        if ($line -match '^\s*#') {
            continue
        }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2]
            $map[$name] = $value
        }
    }

    return $map
}

function Upsert-EnvFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][hashtable]$Entries
    )

    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = Get-Content -LiteralPath $Path
    }

    foreach ($entry in $Entries.GetEnumerator()) {
        $name = $entry.Key
        $value = [string]$entry.Value
        $updated = $false

        for ($index = 0; $index -lt $lines.Count; $index++) {
            if ($lines[$index] -match ('^' + [regex]::Escape($name) + '=')) {
                $lines[$index] = "$name=$value"
                $updated = $true
                break
            }
        }

        if (-not $updated) {
            $lines += "$name=$value"
        }
    }

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function To-Base64 {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
    )
    return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Value))
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedLocalEnvPath = $LocalEnvPath
if (-not $resolvedLocalEnvPath) {
    $resolvedLocalEnvPath = Join-Path $repoRoot '.env'
}
$localEnvTemplatePath = Join-Path $repoRoot '.env.example'

if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Global env file not found: $SourcePath"
}

$keysToSync = @(
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'AZURE_FOUNDRY_API_KEY',
    'AZURE_FOUNDRY_CHAT_URL',
    'AZURE_FOUNDRY_API_VERSION',
    'MODEL_CATALOG',
    'MODEL_PROVIDER_OVERRIDES',
    'DEFAULT_MODELS',
    'ORCHESTRATOR_API_TOKEN',
    'CORS_ALLOWED_ORIGINS',
    'ALLOW_INSECURE_MARKETPLACE_HTTP'
)

$sourceMap = Parse-EnvFile -Path $SourcePath
$selectedEntries = @{}
foreach ($key in $keysToSync) {
    if ($sourceMap.ContainsKey($key)) {
        $selectedEntries[$key] = [string]$sourceMap[$key]
    }
}

if (-not $selectedEntries.Count) {
    throw "No supported keys were found in $SourcePath."
}

if (-not $SkipLocal.IsPresent) {
    if (-not (Test-Path -LiteralPath $resolvedLocalEnvPath) -and (Test-Path -LiteralPath $localEnvTemplatePath)) {
        Copy-Item -LiteralPath $localEnvTemplatePath -Destination $resolvedLocalEnvPath -Force
    }
    Upsert-EnvFile -Path $resolvedLocalEnvPath -Entries $selectedEntries
    Write-Host "Synced $($selectedEntries.Count) key(s) to local env: $resolvedLocalEnvPath"
}

if (-not $SkipRemote.IsPresent) {
    Run-External -FilePath 'ssh' -Arguments @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', $HostAlias, 'echo VPS_OK')

    $scriptLines = @(
        'set -euo pipefail',
        "file='$RemoteEnvPath'",
        'touch "$file"',
        'decode_b64() { printf ''%s'' "$1" | base64 -d; }',
        'update_var() {',
        '  local name="$1"',
        '  local value="$2"',
        '  local tmp',
        '  tmp="$(mktemp)"',
        '  awk -v k="$name" -v v="$value" "BEGIN { done=0 } \$0 ~ \"^\"k\"=\" { print k\"=\"v; done=1; next } { print } END { if (!done) print k\"=\"v }" "$file" > "$tmp"',
        '  mv "$tmp" "$file"',
        '}'
    )

    foreach ($entry in $selectedEntries.GetEnumerator()) {
        $key = [string]$entry.Key
        $value = [string]$entry.Value
        $encoded = To-Base64 -Value $value
        $scriptLines += "update_var '$key' " + '"' + '$(decode_b64 ' + "'$encoded'" + ')' + '"'
    }
    $scriptLines += "echo synced_keys=$($selectedEntries.Count)"

    $remoteScript = [string]::Join("`n", $scriptLines)
    $remoteCommand = 'bash -s'
    if ($UseSudo.IsPresent) {
        $remoteCommand = 'sudo -n bash -s'
    }
    $remoteScript | & ssh $HostAlias $remoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: ssh $HostAlias $remoteCommand"
    }
}

Write-Host 'Done.'
