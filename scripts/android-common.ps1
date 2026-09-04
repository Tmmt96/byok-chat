$ErrorActionPreference = 'Stop'

function Initialize-AndroidEnvironment {
    [CmdletBinding()]
    param(
        [switch]$RequireNdk
    )

    $projectRoot = Split-Path -Parent $PSScriptRoot
    $sdkCandidates = @(@(
            $env:ANDROID_SDK_ROOT,
            $env:ANDROID_HOME,
            (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
        ) | Where-Object { $_ -and (Test-Path $_) })

    if (-not $sdkCandidates) {
        throw 'Android SDK nao encontrado. Instale-o em %LOCALAPPDATA%\Android\Sdk ou defina ANDROID_SDK_ROOT.'
    }

    $sdkRoot = (Resolve-Path $sdkCandidates[0]).Path
    $javaCandidates = @(@(
            $env:JAVA_HOME,
            'C:\Program Files\Android\Android Studio\jbr'
        ) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) })

    if (-not $javaCandidates) {
        throw 'JDK nao encontrado. Instale um JDK 17 ou superior ou defina JAVA_HOME.'
    }

    $javaHome = (Resolve-Path $javaCandidates[0]).Path
    $ndkPath = Join-Path $sdkRoot 'ndk\27.1.12297006'
    if ($RequireNdk -and -not (Test-Path (Join-Path $ndkPath 'source.properties'))) {
        throw "NDK 27.1.12297006 nao esta instalado. Execute .\scripts\repair-android-sdk.ps1."
    }

    $adbPath = Join-Path $sdkRoot 'platform-tools\adb.exe'
    if (-not (Test-Path $adbPath)) {
        throw "ADB nao encontrado em $adbPath."
    }

    $gradlePath = Join-Path $projectRoot 'android\gradlew.bat'
    $expoCliPath = Join-Path $projectRoot 'node_modules\@expo\cli\main.js'
    if (-not (Test-Path $gradlePath)) {
        throw "Gradle wrapper nao encontrado em $gradlePath."
    }
    if (-not (Test-Path $expoCliPath)) {
        throw 'Dependencias nao instaladas. Execute npm install --legacy-peer-deps.'
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw 'Node.js nao encontrado no PATH.'
    }

    $env:JAVA_HOME = $javaHome
    $env:ANDROID_HOME = $sdkRoot
    $env:ANDROID_SDK_ROOT = $sdkRoot
    $env:Path = "$javaHome\bin;$sdkRoot\platform-tools;$env:Path"
    if (-not $env:JAVA_TOOL_OPTIONS) {
        $env:JAVA_TOOL_OPTIONS = '--enable-native-access=ALL-UNNAMED'
    }
    elseif ($env:JAVA_TOOL_OPTIONS -notmatch 'enable-native-access') {
        $env:JAVA_TOOL_OPTIONS = "$env:JAVA_TOOL_OPTIONS --enable-native-access=ALL-UNNAMED"
    }

    [pscustomobject]@{
        ProjectRoot = $projectRoot
        AndroidRoot = Join-Path $projectRoot 'android'
        SdkRoot     = $sdkRoot
        NdkPath     = $ndkPath
        AdbPath     = $adbPath
        GradlePath  = $gradlePath
        ExpoCliPath = $expoCliPath
        NodePath    = $nodeCommand.Source
    }
}

function Get-AndroidDevice {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$AdbPath,
        [string]$Serial
    )

    $output = @(& $AdbPath devices)
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel iniciar o ADB.'
    }

    $devices = @(
        $output | ForEach-Object {
            if ($_ -match '^(?<serial>\S+)\s+(?<state>\S+)') {
                [pscustomobject]@{ Serial = $Matches.serial; State = $Matches.state }
            }
        }
    )
    $authorized = @($devices | Where-Object State -eq 'device')

    if ($Serial) {
        $selected = $authorized | Where-Object Serial -eq $Serial | Select-Object -First 1
        if (-not $selected) {
            $state = $devices | Where-Object Serial -eq $Serial | Select-Object -ExpandProperty State -First 1
            if ($state) {
                throw "O dispositivo $Serial esta em estado '$state'. Desbloqueie-o e aceite a autorizacao ADB."
            }
            throw "O dispositivo $Serial nao foi encontrado pelo ADB."
        }
        return $selected.Serial
    }

    if ($authorized.Count -eq 1) {
        return $authorized[0].Serial
    }
    if ($authorized.Count -eq 0) {
        throw 'Nenhum dispositivo Android autorizado. Ligue o USB, desbloqueie o telemovel e aceite a depuracao USB.'
    }
    throw 'Existem varios dispositivos autorizados. Use -DeviceSerial SERIAL.'
}

function Invoke-Gradle {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Android,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    Push-Location $Android.AndroidRoot
    try {
        & $Android.GradlePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle terminou com o codigo $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Install-AndroidApk {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Android,
        [Parameter(Mandatory)]
        [string]$Serial,
        [Parameter(Mandatory)]
        [string]$ApkPath
    )

    & $Android.AdbPath -s $Serial install -r $ApkPath
    if ($LASTEXITCODE -ne 0) {
        throw 'A instalacao da APK falhou.'
    }
}
