param(
    [string]$ClipsDirectory = (Join-Path $env:TEMP 'screen-recorder-stt-eval-20261031'),
    [switch]$IncludeSoniox,
    [switch]$IncludeAssemblyAI,
    [string[]]$Samples = @(),
    [switch]$RetryErrors
)

$ErrorActionPreference = 'Stop'
$required = @('DEEPGRAM_API_KEY', 'ELEVENLABS_API_KEY')
if ($IncludeSoniox) { $required += 'SONIOX_API_KEY' }
if ($IncludeAssemblyAI) { $required += 'ASSEMBLYAI_API_KEY' }
$added = @()
$envFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\.env'))
$envLines = if (Test-Path -LiteralPath $envFile) { @(Get-Content -LiteralPath $envFile) } else { @() }

try {
    foreach ($name in $required) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process')) { continue }
        $matching = @($envLines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') })
        if ($matching.Count -gt 0) {
            $fromFile = ($matching[-1] -split '=', 2)[1].Trim()
            if ($fromFile.Length -ge 2 -and (
                ($fromFile.StartsWith('"') -and $fromFile.EndsWith('"')) -or
                ($fromFile.StartsWith("'") -and $fromFile.EndsWith("'"))
            )) { $fromFile = $fromFile.Substring(1, $fromFile.Length - 2) }
            if (-not [string]::IsNullOrWhiteSpace($fromFile)) {
                [Environment]::SetEnvironmentVariable($name, $fromFile, 'Process')
                $added += $name
                $fromFile = $null
                continue
            }
        }
        $secret = Read-Host "$name (entrada oculta)" -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try {
            $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            if ([string]::IsNullOrWhiteSpace($value)) { throw "$name está vazia." }
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            $added += $name
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $value = $null
            $secret.Dispose()
        }
    }

    $scriptPath = Join-Path $PSScriptRoot 'compare-providers.mjs'
    $providers = 'deepgram,elevenlabs'
    if ($IncludeSoniox) { $providers += ',soniox' }
    if ($IncludeAssemblyAI) { $providers += ',assemblyai' }
    $nodeArgs = @($scriptPath, $ClipsDirectory, "--providers=$providers")
    if ($Samples.Count -gt 0) { $nodeArgs += "--samples=$($Samples -join ',')" }
    if ($RetryErrors) { $nodeArgs += '--retry-errors' }
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) { throw "Comparação encerrada com código $LASTEXITCODE." }
} finally {
    foreach ($name in $added) {
        Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
    }
}
