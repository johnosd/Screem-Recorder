# Gera amostras de FALA nos formatos aceitos pelo app, para tests/integration/deepgram-live.test.mjs.
# Saída fora do repositório (%TEMP%\screen-recorder-stt-eval-20261031\formats), para não versionar áudio pessoal.
#   - PT-BR: derivado de sample01.webm (amostra de fala da avaliação de provedores).
#   - Inglês: sintetizado com a voz "Microsoft David Desktop" (System.Speech do Windows).
# Requer ffmpeg no PATH.
[CmdletBinding()]
param(
    [string]$Source = (Join-Path $env:TEMP 'screen-recorder-stt-eval-20261031\sample01.webm'),
    [string]$OutDir = (Join-Path $env:TEMP 'screen-recorder-stt-eval-20261031\formats')
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg não encontrado no PATH.' }
if (-not (Test-Path -LiteralPath $Source)) { throw "Amostra PT-BR não encontrada: $Source" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Inglês sintetizado
$wav = Join-Path $OutDir 'fala-en.wav'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft David Desktop')
$synth.SetOutputToWaveFile($wav)
$synth.Speak('This is a short test of the screen recorder extension. We are checking that the transcription service understands English speech. The quick brown fox jumps over the lazy dog, and then goes back to sleep.')
$synth.Dispose()

function Convert([string]$media, [string]$prefix) {
    $ffmpegArgs = @('-y', '-loglevel', 'error')
    # áudio WebM/Opus
    & ffmpeg @ffmpegArgs -i $media -vn -c:a libopus -b:a 48k (Join-Path $OutDir "$prefix.webm")
    # MP3
    & ffmpeg @ffmpegArgs -i $media -vn -c:a libmp3lame -q:a 4 (Join-Path $OutDir "$prefix.mp3")
    # MP4 com vídeo preto e áudio AAC (o app extrai o AAC como M4A)
    & ffmpeg @ffmpegArgs -f lavfi -i 'color=c=black:s=320x240:r=5' -i $media -map 0:v -map 1:a -shortest `
        -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 96k (Join-Path $OutDir "$prefix.mp4")
}

Convert $Source 'fala-pt'
Convert $wav 'fala-en'
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Host

# Arquivo longo (amostra PT-BR repetida 6 vezes, cerca de 4,7 min e vários MB) para medir tempo e limite de tamanho.
& ffmpeg -y -loglevel error -stream_loop 5 -i $Source -vn -c:a libmp3lame -q:a 4 (Join-Path $OutDir 'fala-pt-longa.mp3')
