# BYOK Chat

Fundacao da Fase 0 para uma app mobile de chat com IA em BYOK.

## Estado atual

- Expo + React Native + TypeScript strict.
- OpenAI Responses API com `gpt-5.6-luna`.
- API key apenas no Secure Store.
- SQLite local para projetos, conversas e mensagens.
- Contexto completo de todas as conversas do projeto.
- Contrato preparado para handoff/compaction quando o contexto ultrapassa o limite.
- Composer com escolha de modelo, ditado `pt-PT` e envio.
- Modo de resposta Texto/Voz.
- TTS com vozes disponiveis no dispositivo.
- POC experimental de TTS Piper offline no Android, com voz `pt_PT-tugao-medium` descarregada sob pedido.
- Inbox com projetos e conversas recentes.
- Nome do utilizador guardado localmente no Secure Store, sem login remoto.
- Conversas que podem ser associadas a projetos ou apagadas localmente.
- Provider customizado com endpoint OpenAI-compatible, modelo e key próprios.
- Classe base SSE reutilizável para adapters de OpenAI, Claude, Gemini e outros providers.
- Teste unitario do assembler de contexto.

## Setup

Requisito: Node.js 20 LTS ou superior. O projeto foi alinhado com Expo 57 e React Native 0.86.

```powershell
nvm use 20.19.4
npm install --legacy-peer-deps
npm run typecheck
npm test
```

O reconhecimento de voz requer um development build. O Expo Go nao e suficiente para validar todas as permissoes e modulos nativos.

O Piper requer uma APK/development build propria. O runtime nativo suporta `arm64-v8a` e `x86_64`; a voz portuguesa ocupa aproximadamente 63 MB e e guardada no armazenamento privado do dispositivo depois do download. O runtime `react-native-piper-tts` esta em alpha e sob GPL-3.0-or-later; validar a compatibilidade da licenca antes de qualquer distribuicao comercial.

```powershell
npx expo start
```

## Launcher Python

No Windows, a solucao tambem pode ser iniciada pelo script em `docs`:

```powershell
py .\docs\executar-solucao.py --platform web
py .\docs\executar-solucao.py --platform native
py .\docs\executar-solucao.py --install --platform web --clear
```

O modo `web` abre a preview em `http://localhost:8082`. O modo `native` inicia o Metro e mostra o QR code para Expo Go.

## Android fisico e APKs

Os comandos para executar a app num telemovel, criar uma APK debug e criar uma APK release autonoma estao em [docs/android.md](docs/android.md).

A validacao automatizada dos fluxos locais e Android esta em [docs/validar-fluxos.md](docs/validar-fluxos.md), com scripts Python sem dependencias externas.

## Fase 0

Antes de usar uma API key real, validar num iPhone e num Android fisicos:

1. Secure Store sem key em logs ou SQLite.
2. Request direto para OpenAI com `store: false`.
3. Streaming, erro e cancelamento.
4. Duas conversas num projeto e uma nova prompt com contexto completo.
5. Handoff/compaction quando o threshold for atingido.
6. Ditado com locale `pt-PT` e revisao antes do envio.
7. TTS com voz instalada no dispositivo.
8. Entrada em background e rede instavel.

## Privacidade

A app envia prompts diretamente para o provider selecionado. O backend proprio nao faz parte do caminho das conversas. A key e lida do Secure Store apenas durante a operacao de rede e nunca deve ser colocada em logs, URLs, SQLite ou estado persistido.
