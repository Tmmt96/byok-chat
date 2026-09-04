[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$tempRoot = Join-Path $sdkRoot '.temp'
$archive = Join-Path $tempRoot 'android-ndk-r27b-windows.zip'
$partialArchive = "$archive.partial"
$extractRoot = Join-Path $tempRoot 'ndk-extract'
$sourceRoot = Join-Path $extractRoot 'android-ndk-r27b'
$ndkPath = Join-Path $sdkRoot 'ndk\27.1.12297006'
$url = 'https://dl.google.com/android/repository/android-ndk-r27b-windows.zip'

$curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
$tar = (Get-Command tar.exe -ErrorAction SilentlyContinue).Source
if (-not $curl) {
    throw 'curl.exe nao foi encontrado no PATH.'
}
if (-not $tar) {
    throw 'tar.exe nao foi encontrado no PATH.'
}

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
Remove-Item $partialArchive -Force -ErrorAction SilentlyContinue
Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host 'A descarregar o NDK 27.1.12297006 (aproximadamente 745 MB)...'
& $curl -L --fail --retry 5 --retry-delay 3 --output $partialArchive $url
if ($LASTEXITCODE -ne 0) {
    throw 'O download do NDK falhou.'
}
Move-Item $partialArchive $archive -Force

New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
Write-Host 'A extrair o NDK...'
& $tar -xf $archive -C $extractRoot
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $sourceRoot 'source.properties'))) {
    throw 'O arquivo do NDK esta incompleto ou a extracao falhou.'
}

Remove-Item $ndkPath -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ndkPath) | Out-Null
Move-Item $sourceRoot $ndkPath -Force

if (-not (Test-Path (Join-Path $ndkPath 'source.properties'))) {
    throw 'A instalacao do NDK nao ficou completa.'
}

Write-Host "NDK pronto em $ndkPath"