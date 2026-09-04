import { testCustomApiConnection } from '../src/providers/custom-api';

describe('Custom API connection test', () => {
    it('accepts an OpenAI-compatible streaming response without persisting it', async () => {
        const originalFetch = global.fetch;
        const cancel = jest.fn().mockResolvedValue(undefined);
        const releaseLock = jest.fn();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: { getReader: () => ({ read: jest.fn().mockResolvedValue({ value: new Uint8Array([100]), done: false }), cancel, releaseLock }) },
        }) as jest.Mock;

        await expect(testCustomApiConnection({ id: 'test', name: 'Teste', endpoint: 'https://api.example.com/v1/chat/completions', model: 'test-model' }, 'test-key')).resolves.toEqual({ ok: true });
        expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.objectContaining({ method: 'POST' }));
        expect(cancel).toHaveBeenCalled();
        expect(releaseLock).toHaveBeenCalled();
        global.fetch = originalFetch;
    });
});