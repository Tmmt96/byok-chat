import * as Speech from 'expo-speech';

export async function getPortugueseVoices() {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.filter((voice) => voice.language.toLowerCase().replace('_', '-') === 'pt-pt');
}

export function speakResponse(text: string, voice?: string) {
    Speech.stop();
    Speech.speak(text, {
        voice,
        language: 'pt-PT',
        rate: 0.95,
        onError: () => undefined,
    });
}
