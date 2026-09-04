jest.mock('expo-speech', () => ({
    speak: jest.fn(),
    stop: jest.fn(),
}));

import * as Speech from 'expo-speech';
import { speakResponse, splitSpeechText } from '../src/features/voice';

describe('voice responses', () => {
    beforeEach(() => jest.clearAllMocks());

    it('speaks through the native module without requiring a selected voice', () => {
        speakResponse('Resposta pronta');

        expect(Speech.stop).toHaveBeenCalledTimes(1);
        expect(Speech.speak).toHaveBeenCalledWith('Resposta pronta', expect.objectContaining({ language: 'pt-PT', rate: 0.95 }));
        expect((Speech.speak as jest.Mock).mock.calls[0][1]).not.toHaveProperty('voice');
    });

    it('passes the selected voice when one exists', () => {
        speakResponse('Resposta pronta', 'voice-pt');

        expect(Speech.speak).toHaveBeenCalledWith('Resposta pronta', expect.objectContaining({ voice: 'voice-pt' }));
    });

    it('forwards completion and stop callbacks to the speech module', () => {
        const onDone = jest.fn();
        const onStopped = jest.fn();

        speakResponse('Resposta pronta', undefined, { onDone, onStopped });

        const options = (Speech.speak as jest.Mock).mock.calls[0][1];
        options.onDone();

        expect(onDone).toHaveBeenCalledTimes(1);
        expect(onStopped).not.toHaveBeenCalled();

        speakResponse('Resposta interrompida', undefined, { onStopped });
        const stoppedOptions = (Speech.speak as jest.Mock).mock.calls[1][1];
        stoppedOptions.onStopped();

        expect(onStopped).toHaveBeenCalledTimes(1);
    });

    it('splits long responses below the Expo speech limit', () => {
        const text = 'Texto longo. '.repeat(600);
        const chunks = splitSpeechText(text);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.length <= 3900)).toBe(true);

        speakResponse(text);
        for (let index = 0; index < chunks.length; index += 1) {
            const options = (Speech.speak as jest.Mock).mock.calls[index][1];
            options.onDone();
        }

        expect((Speech.speak as jest.Mock).mock.calls.every(([chunk]) => chunk.length <= 3900)).toBe(true);
        expect((Speech.speak as jest.Mock).mock.calls).toHaveLength(chunks.length);
    });
});