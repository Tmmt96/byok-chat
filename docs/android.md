# Android: executar e criar APKs

Este projeto usa Expo 57, React Native 0.86 e Android SDK local. Os scripts definem automaticamente `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` e a flag de acesso nativo necessaria pelo JDK 25.

## Preparacao unica

Requisitos:

- Node.js 20 LTS ou superior.
- Android Studio com SDK Platform 36, Build Tools 36.0.0, CMake 3.22.1 e NDK 27.1.12297006.
- Um telemovel Android com Depuracao USB ativa e autorizado no ADB.

Instalar dependencias do projeto:

```powershell
npm install --legacy-peer-deps
```

Se o Gradle disser que o NDK esta incompleto, reparar apenas o NDK:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\repair-android-sdk.ps1
```

## Executar a app no telemovel

A APK debug nao inclui o bundle JavaScript. O Metro tem de ficar aberto durante o teste:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-android.ps1
```

O script escolhe o unico dispositivo autorizado, cria `adb reverse tcp:8081 tcp:8081`, abre a app e inicia o Metro. Para escolher um dispositivo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-android.ps1 -DeviceSerial RFCX70QSR0Z
```

Para limpar o cache do Metro:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-android.ps1 -Clear
```

Se nao houver dispositivo autorizado, desbloquear o telemovel, aceitar o dialogo de depuracao USB e repetir.

## Build APK debug

A debug e adequada para desenvolvimento e pode ser instalada diretamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

Saida:

`android\app\build\outputs\apk\debug\app-debug.apk`

Para compilar e instalar no Samsung:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -Install -DeviceSerial RFCX70QSR0Z
```

O script usa `arm64-v8a` por defeito. Para gerar varias arquiteturas:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -Architectures "armeabi-v7a,arm64-v8a,x86,x86_64"
```

## Build APK release

A release inclui o bundle JavaScript e funciona sem Metro:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release.ps1
```

Saida:

`android\app\build\outputs\apk\release\app-release.apk`

Para compilar e instalar diretamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release.ps1 -Install -DeviceSerial RFCX70QSR0Z
```

A configuracao atual assina a release com o keystore debug do projeto. Serve para testes locais, mas deve ser substituida por um keystore de distribuicao antes de publicar a app.

## Opcoes comuns

Adicionar `-Clean` aos scripts de build quando for necessario limpar os artefactos nativos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -Clean
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release.ps1 -Clean
```

Ver dispositivos ADB:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

A chave OpenAI e introduzida na app e guardada apenas no Secure Store. Nunca a colocar em scripts, ficheiros `.env`, logs ou argumentos de comandos.
