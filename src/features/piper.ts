import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { splitSpeechText } from './voice';

const MODEL_NAME = 'pt_PT-tugao-medium.onnx';
const MODEL_REVISION = 'f5a6e9094787fd865d65cb024472f977f9c542b5';
const MODEL_SIZE = 63_201_294;
const MODEL_URL = `https://huggingface.co/rhasspy/piper-voices/resolve/${MODEL_REVISION}/pt/pt_PT/tug%C3%A3o/medium/pt_PT-tug%C3%A3o-medium.onnx`;
const MODEL_CONFIG_URL = `${MODEL_URL}.json`;
const MODEL_DIRECTORY = 'piper/pt_PT-tugao-medium/';
const ESPEAK_DATA_PATH = 'espeak-ng-data';

export type PiperVoiceStatus = 'unavailable' | 'native-missing' | 'not-downloaded' | 'ready' | 'downloading';

type PiperCallbacks = {
    onStart?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: Error) => void;
};

type PiperModule = typeof import('react-native-piper-tts');

let nativePiper: PiperModule | undefined;
let initialized = false;
let activeRequest = 0;

function getNativePiper() {
    if (Platform.OS !== 'android') throw new Error('Piper offline está disponível apenas no Android neste protótipo.');
    if (!nativePiper) {
        try {
            nativePiper = require('react-native-piper-tts') as PiperModule;
        } catch {
            throw new Error('O módulo nativo Piper não está nesta APK. Fecha a app e recompila o development build Android.');
        }
    }
    return nativePiper;
}

function getModelDirectory() {
    if (!FileSystem.documentDirectory) throw new Error('O armazenamento local não está disponível.');
    return `${FileSystem.documentDirectory}${MODEL_DIRECTORY}`;
}

function toNativePath(uri: string) {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function modelPaths() {
    const directory = getModelDirectory();
    return {
        modelUri: `${directory}${MODEL_NAME}`,
        configUri: `${directory}${MODEL_NAME}.json`,
    };
}

async function isInstalled() {
    if (Platform.OS !== 'android') return false;
    const { modelUri, configUri } = modelPaths();
    const [model, config] = await Promise.all([
        FileSystem.getInfoAsync(modelUri),
        FileSystem.getInfoAsync(configUri),
    ]);
    if (!model.exists || model.size !== MODEL_SIZE || !config.exists || !config.size) return false;
    try {
        const parsedConfig = JSON.parse(await FileSystem.readAsStringAsync(configUri));
        return Boolean(parsedConfig && typeof parsedConfig === 'object');
    } catch {
        return false;
    }
}

export async function getPiperVoiceStatus(): Promise<PiperVoiceStatus> {
    if (Platform.OS !== 'android') return 'unavailable';
    try {
        getNativePiper();
    } catch {
        return 'native-missing';
    }
    return (await isInstalled()) ? 'ready' : 'not-downloaded';
}

async function downloadFile(url: string, destination: string, onProgress?: (value: number) => void) {
    const temporaryDestination = `${destination}.download`;
    await FileSystem.deleteAsync(temporaryDestination, { idempotent: true });
    const task = FileSystem.createDownloadResumable(
        url,
        temporaryDestination,
        undefined,
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
            if (totalBytesExpectedToWrite > 0) onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
        },
    );
    try {
        const result = await task.downloadAsync();
        if (!result) throw new Error('O download foi cancelado.');
        await FileSystem.deleteAsync(destination, { idempotent: true });
        await FileSystem.moveAsync({ from: temporaryDestination, to: destination });
    } catch (error) {
        await FileSystem.deleteAsync(temporaryDestination, { idempotent: true });
        throw error;
    }
}

export async function downloadPiperVoice(onProgress?: (value: number) => void) {
    if (Platform.OS !== 'android') throw new Error('O Piper offline está disponível apenas no Android.');
    const directory = getModelDirectory();
    const { modelUri, configUri } = modelPaths();
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    if (await isInstalled()) return;

    await downloadFile(MODEL_URL, modelUri, (value) => onProgress?.(value * 0.98));
    await downloadFile(MODEL_CONFIG_URL, configUri, () => onProgress?.(0.99));

    try {
        const config = await FileSystem.readAsStringAsync(configUri);
        const parsedConfig = JSON.parse(config);
        if (!parsedConfig || typeof parsedConfig !== 'object') throw new Error('Formato inválido.');
    } catch {
        await FileSystem.deleteAsync(modelUri, { idempotent: true });
        await FileSystem.deleteAsync(configUri, { idempotent: true });
        throw new Error('A configuração da voz Piper não é válida.');
    }
    if (!(await isInstalled())) throw new Error('O modelo Piper descarregado parece incompleto.');
    onProgress?.(1);
}

export async function initializePiper() {
    if (initialized) return;
    if (!(await isInstalled())) throw new Error('Descarrega primeiro a voz Piper pt-PT.');
    const piper = getNativePiper();
    const { modelUri } = modelPaths();
    await piper.initialize(toNativePath(modelUri), ESPEAK_DATA_PATH);
    piper.setRate(0.95);
    initialized = true;
}

export function stopPiper() {
    activeRequest += 1;
    nativePiper?.stop();
}

export async function speakPiperResponse(text: string, callbacks?: PiperCallbacks) {
    const piper = getNativePiper();
    await initializePiper();
    const chunks = splitSpeechText(text);
    if (chunks.length === 0) {
        callbacks?.onDone?.();
        return;
    }

    const requestId = ++activeRequest;
    try {
        for (let index = 0; index < chunks.length; index += 1) {
            if (requestId !== activeRequest) {
                callbacks?.onStopped?.();
                return;
            }
            const chunk = chunks[index];
            if (!chunk) continue;
            if (index === 0) callbacks?.onStart?.();
            await piper.speak(chunk);
        }
        if (requestId === activeRequest) callbacks?.onDone?.();
        else callbacks?.onStopped?.();
    } catch (error) {
        if (requestId !== activeRequest) callbacks?.onStopped?.();
        else callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
}