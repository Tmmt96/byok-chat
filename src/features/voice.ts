import * as Speech from 'expo-speech';

const MAX_SPEECH_CHARS = 3900;

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

export function splitSpeechText(text: string) {
    const remainingText = text.trim();
    if (!remainingText) return [];

    const chunks: string[] = [];
    let remaining = remainingText;
    const delimiters = ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '];

    while (remaining.length > MAX_SPEECH_CHARS) {
        let splitAt = -1;
        for (const delimiter of delimiters) {
            const candidate = remaining.lastIndexOf(delimiter, MAX_SPEECH_CHARS - delimiter.length);
            if (candidate > splitAt) splitAt = candidate + delimiter.length;
        }
        if (splitAt <= 0) splitAt = MAX_SPEECH_CHARS;
        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trimStart();
    }
    chunks.push(remaining);
    return chunks;
}

export function speakResponse(text: string, voice?: string, callbacks?: VoiceCallbacks) {
    Speech.stop();
    const chunks = splitSpeechText(text);
    let chunkIndex = 0;
    let finished = false;

    const finishWithError = (error: Error) => {
        if (finished) return;
        finished = true;
        callbacks?.onError?.(error);
    };
    const finishStopped = () => {
        if (finished) return;
        finished = true;
        callbacks?.onStopped?.();
    };
    const speakNextChunk = () => {
        const chunk = chunks[chunkIndex];
        if (!chunk) {
            if (!finished) {
                finished = true;
                callbacks?.onDone?.();
            }
            return;
        }
        chunkIndex += 1;
        const speech = Speech.speak(chunk, {
            ...(voice ? { voice } : {}),
            language: 'pt-PT',
            rate: 0.95,
            onStart: chunkIndex === 1 ? callbacks?.onStart : undefined,
            onDone: speakNextChunk,
            onStopped: finishStopped,
            onError: finishWithError,
        });
        void Promise.resolve(speech).catch((error: Error) => finishWithError(error));
    };

    speakNextChunk();
}
