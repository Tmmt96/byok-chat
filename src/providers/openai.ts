import type { ProviderRequest, StreamEvent } from '../domain/types';
import { secureStore } from '../infrastructure/secure-store';
import { BaseSseProvider } from './base-sse';

const endpoint = 'https://api.openai.com/v1/responses';
const fallbackMaxOutputTokens = 1200;

export function buildOpenAIRequestBody(request: ProviderRequest) {
    return {
        model: request.model,
        input: request.input,
        stream: true,
        store: false,
        max_output_tokens: request.maxOutputTokens ?? fallbackMaxOutputTokens,
    };
}

class OpenAIProvider extends BaseSseProvider {
    readonly id = 'openai' as const;
    protected providerName = 'OpenAI';
    protected missingConfigurationMessage = 'Configure uma API key OpenAI nas Definições.';

    protected getEndpoint(_request: ProviderRequest) {
        return endpoint;
    }

    protected getApiKey(_request: ProviderRequest) {
        return secureStore.getOpenAIKey();
    }

    protected buildRequestBody(request: ProviderRequest) {
        return buildOpenAIRequestBody(request);
    }

    protected parsePayload(payload: Record<string, unknown>): StreamEvent | undefined {
        const event = payload as { type?: string; delta?: string; response?: { usage?: { input_tokens?: number; output_tokens?: number } } };
        if (event.type === 'response.output_text.delta' && event.delta) return { type: 'text_delta', text: event.delta };
        if (event.type === 'response.completed') return { type: 'usage', usage: { inputTokens: event.response?.usage?.input_tokens, outputTokens: event.response?.usage?.output_tokens } };
        return undefined;
    }
}

export const openAIProvider = new OpenAIProvider();

export function streamOpenAI(request: ProviderRequest, onEvent: (event: StreamEvent) => void) {
    return openAIProvider.stream(request, onEvent);
}
