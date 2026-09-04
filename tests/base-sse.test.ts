import { BaseSseProvider } from '../src/providers/base-sse';
import type { ProviderRequest, StreamEvent } from '../src/domain/types';

class TestSseProvider extends BaseSseProvider {
    readonly id = 'custom' as const;
    protected missingConfigurationMessage = 'Configuração em falta.';
    protected providerName = 'Teste';

    protected getEndpoint() {
        return 'https://example.test/chat';
    }

    protected getApiKey() {
        return Promise.resolve('test-key');
    }

    protected buildRequestBody() {
        return { stream: true };
    }

    protected parsePayload(): StreamEvent | undefined {
        return undefined;
    }
}

describe('base SSE provider', () => {
    it('does not emit a network error for an intentional abort', async () => {
        const abortController = new AbortController();
        abortController.abort();
        const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('The operation was aborted.'));
        const events: StreamEvent[] = [];
        const request: ProviderRequest = { model: 'test', input: [], signal: abortController.signal };

        await new TestSseProvider().stream(request, (event) => events.push(event));

        expect(events).toEqual([]);
        fetchMock.mockRestore();
    });
});