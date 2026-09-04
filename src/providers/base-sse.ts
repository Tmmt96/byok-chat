import type { AIProviderAdapter, ProviderError, ProviderId, ProviderRequest, StreamEvent } from '../domain/types';

type SsePayload = Record<string, unknown>;

export abstract class BaseSseProvider implements AIProviderAdapter {
    abstract readonly id: ProviderId;

    protected abstract getEndpoint(request: ProviderRequest): Promise<string | null | undefined> | string | null | undefined;
    protected abstract getApiKey(request: ProviderRequest): Promise<string | null | undefined>;
    protected abstract buildRequestBody(request: ProviderRequest): Promise<unknown> | unknown;
    protected abstract parsePayload(payload: SsePayload): StreamEvent | undefined;
    protected abstract missingConfigurationMessage: string;
    protected abstract providerName: string;

    protected getHeaders(apiKey: string) {
        return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    }

    protected normalizeError(status: number, message: string): ProviderError {
        if (status === 401 || status === 403) return { code: 'authentication', message: `A key de ${this.providerName} não foi aceite.`, retryable: false };
        if (status === 429) return { code: 'rate_limit', message: 'O limite de pedidos foi atingido.', retryable: true };
        if (status === 400) return { code: 'invalid_request', message: 'O pedido não é válido para este provider.', retryable: false };
        if (status >= 500) return { code: 'provider', message: `${this.providerName} está temporariamente indisponível.`, retryable: true };
        return { code: 'unknown', message: message || 'Não foi possível concluir o pedido.', retryable: false };
    }

    async stream(request: ProviderRequest, onEvent: (event: StreamEvent) => void) {
        const apiKey = await this.getApiKey(request);
        const endpoint = await this.getEndpoint(request);
        if (!apiKey || !endpoint) {
            onEvent({ type: 'error', error: { code: 'authentication', message: this.missingConfigurationMessage, retryable: false } });
            return;
        }

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                signal: request.signal,
                headers: this.getHeaders(apiKey),
                body: JSON.stringify(await this.buildRequestBody(request)),
            });
        } catch {
            if (request.signal?.aborted) return;
            onEvent({ type: 'error', error: { code: 'network', message: 'Sem ligação à internet.', retryable: true } });
            return;
        }

        if (!response.ok || !response.body) {
            onEvent({ type: 'error', error: this.normalizeError(response.status, await response.text()) });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const payload = line.slice(5).trim();
                    if (!payload || payload === '[DONE]') continue;
                    try {
                        const event = this.parsePayload(JSON.parse(payload) as SsePayload);
                        if (event) onEvent(event);
                    } catch {
                        onEvent({ type: 'error', error: { code: 'provider', message: `A resposta de ${this.providerName} não pôde ser lida.`, retryable: false } });
                    }
                }
            }
            onEvent({ type: 'done' });
        } catch {
            if (request.signal?.aborted) return;
            onEvent({ type: 'error', error: { code: 'network', message: `A ligação a ${this.providerName} foi interrompida.`, retryable: true } });
        } finally {
            reader.releaseLock();
        }
    }
}