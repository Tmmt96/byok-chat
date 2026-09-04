[CmdletBinding()]
param(
    [string]$DeviceSerial,
    [int]$Port = 8081,
    [switch]$Clear
)

. (Join-Path $PSScriptRoot 'android-common.ps1')
$android = Initialize-AndroidEnvironment
$serial = Get-AndroidDevice -AdbPath $android.AdbPath -Serial $DeviceSerial

& $android.AdbPath -s $serial reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel criar o tunel USB para a porta $Port."
}

& $android.AdbPath -s $serial shell am force-stop com.byokchat.mobile
& $android.AdbPath -s $serial shell am start -n com.byokchat.mobile/.MainActivity
if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel abrir a aplicacao no dispositivo.'
}

$env:NODE_ENV = 'development'
$expoArguments = @('start', '--port', "$Port")
if ($Clear) {
    $expoArguments += '--clear'
}

Write-Host "Metro ativo para $serial na porta $Port. Mantenha esta janela aberta durante o teste."
& $android.NodePath $android.ExpoCliPath @expoArguments
exit $LASTEXITCODE
