jest.mock('expo-speech', () => ({
    speak: jest.fn(),
    stop: jest.fn(),
}));

import * as Speech from 'expo-speech';
import { speakResponse } from '../src/features/voice';

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
        options.onStopped();

        expect(onDone).toHaveBeenCalledTimes(1);
        expect(onStopped).toHaveBeenCalledTimes(1);
    });
});