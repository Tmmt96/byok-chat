import * as Speech from 'expo-speech';

type VoiceCallbacks = {
    onStart?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: Error) => void;
};

export async function getPortugueseVoices() {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.filter((voice) => voice.language.toLowerCase().replace('_', '-') === 'pt-pt');
}

export function speakResponse(text: string, voice?: string, callbacks?: VoiceCallbacks) {
    Speech.stop();
    Speech.speak(text, {
        ...(voice ? { voice } : {}),
        language: 'pt-PT',
        rate: 0.95,
        onStart: callbacks?.onStart,
        onDone: callbacks?.onDone,
        onStopped: callbacks?.onStopped,
        onError: callbacks?.onError,
    });
}
