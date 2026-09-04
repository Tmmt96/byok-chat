[CmdletBinding()]
param(
    [string]$DeviceSerial,
    [string]$Architectures = 'arm64-v8a',
    [switch]$Install,
    [switch]$Clean
)

. (Join-Path $PSScriptRoot 'android-common.ps1')
$android = Initialize-AndroidEnvironment -RequireNdk
$env:NODE_ENV = 'development'

if ($Clean) {
    Invoke-Gradle -Android $android -Arguments @('clean', '--no-daemon', '--console=plain')
}

$gradleArguments = @(
    'app:assembleDebug',
    "-PreactNativeArchitectures=$Architectures",
    '--no-daemon',
    '--console=plain'
)
Invoke-Gradle -Android $android -Arguments $gradleArguments

$apkPath = Join-Path $android.AndroidRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apkPath)) {
    throw "Build terminou sem gerar $apkPath."
}

Write-Host "APK debug pronta: $apkPath"
if ($Install) {
    $serial = Get-AndroidDevice -AdbPath $android.AdbPath -Serial $DeviceSerial
    Install-AndroidApk -Android $android -Serial $serial -ApkPath $apkPath
    Write-Host "APK debug instalada em $serial."
}
