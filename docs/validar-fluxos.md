# Validar fluxos do BYOK Chat

A validacao tem dois niveis. O primeiro nao altera o dispositivo e verifica o codigo, o TypeScript, os testes unitarios, o Metro e o estado da APK. O segundo usa UIAutomator para tocar nos controlos por texto/content-description e exercita os fluxos nao destrutivos da app.

## Validacao local

A partir da raiz do projeto:

```powershell
py -3 .\scripts\validate_app.py
py -3 .\scripts\validate_builds.py
```

Para obter JSON, adequado a CI:

```powershell
py -3 .\scripts\validate_app.py --json
py -3 .\scripts\validate_builds.py --json
```

O validador local verifica:

- marcadores dos handlers principais no `App.tsx`;
- parser SSE e limpeza do estado de streaming;
- `tsc --noEmit` e Jest, quando `node` e as dependencias estao disponiveis;
- existencia do SDK, NDK, Gradle wrapper e APKs;
- se a release contem `assets/index.android.bundle`.

## Validacao no Samsung

1. Iniciar o Metro e a app debug:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-android.ps1 -DeviceSerial RFCX70QSR0Z
```

2. Numa segunda consola, executar o smoke test:

```powershell
py -3 .\scripts\validate_app.py --runtime --serial RFCX70QSR0Z
```

O smoke test valida, sem enviar prompts nem guardar uma API key:

- carregamento da Home;
- abertura e fecho de Definicoes;
- abertura e fecho de Novo projeto;
- criacao de conversa nova pela Home;
- criacao de conversa nova pelo separador Chat;
- selecao de modelo;
- abertura e fecho de Opcoes;
- alternancia Texto/Voz;
- abertura de conversa de projeto e contexto partilhado;
- abertura e fecho do modal de associacao a projeto;
- envio de um prompt de teste com `Keyboard.dismiss()` antes do streaming;
- limite de `1200` tokens de saída imposto no payload `max_output_tokens`;
- resposta de teste concluida e renderizacao de headings, listas, negrito e codigo Markdown;
- pacote instalado, processo vivo, reverse ADB e logs criticos.

O script termina com codigo diferente de zero quando encontra um `FAIL`. `SKIP` significa que o ambiente necessario nao estava disponivel, por exemplo Metro desligado ou nenhum dispositivo autorizado.

## Release offline

Para validar o bundle sem Metro:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release.ps1 -Architectures arm64-v8a -Install -DeviceSerial RFCX70QSR0Z
py -3 .\scripts\validate_builds.py --require-release
```

Depois de instalar a release, desligar o Metro e abrir a app. O processo deve arrancar porque a release inclui o bundle JavaScript.

## Limites conhecidos

O smoke test nao envia pedidos para a OpenAI, nao introduz credenciais reais e nao aceita permissoes do sistema automaticamente. O reconhecimento `pt-PT`, TTS, Secure Store e streaming real precisam de um teste manual controlado ou de um ambiente de integracao com credencial temporaria e logs redigidos.

Os resultados devem ser guardados com `--json` em CI. Nunca guardar API keys, headers `Authorization` ou prompts reais nos artefactos de validacao.
