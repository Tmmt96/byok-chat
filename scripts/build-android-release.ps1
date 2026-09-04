[CmdletBinding()]
param(
    [string]$DeviceSerial,
    [string]$Architectures = 'arm64-v8a',
    [switch]$Install,
    [switch]$Clean
)

. (Join-Path $PSScriptRoot 'android-common.ps1')
$android = Initialize-AndroidEnvironment -RequireNdk
$env:NODE_ENV = 'production'

if ($Clean) {
    Invoke-Gradle -Android $android -Arguments @('clean', '--no-daemon', '--console=plain')
}

$gradleArguments = @(
    'app:assembleRelease',
    "-PreactNativeArchitectures=$Architectures",
    '--no-daemon',
    '--console=plain'
)
Invoke-Gradle -Android $android -Arguments $gradleArguments

$apkPath = Join-Path $android.AndroidRoot 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apkPath)) {
    throw "Build terminou sem gerar $apkPath."
}

Write-Host "APK release pronta: $apkPath"
Write-Host 'Esta release inclui o bundle JavaScript e nao precisa do Metro.'
if ($Install) {
    $serial = Get-AndroidDevice -AdbPath $android.AdbPath -Serial $DeviceSerial
    Install-AndroidApk -Android $android -Serial $serial -ApkPath $apkPath
    Write-Host "APK release instalada em $serial."
}
