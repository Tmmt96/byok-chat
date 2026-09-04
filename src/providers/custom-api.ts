import type { CustomProviderProfile, ProviderRequest, StreamEvent } from '../domain/types';
import { secureStore } from '../infrastructure/secure-store';
import { BaseSseProvider } from './base-sse';

type CustomApiPayload = {
    choices?: Array<{ delta?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function buildCustomApiRequestBody(request: ProviderRequest, model: string) {
    return {
        model,
        messages: request.input,
        stream: true,
        max_tokens: request.maxOutputTokens,
    };
}

class CustomApiProvider extends BaseSseProvider {
    readonly id = 'custom' as const;
    protected providerName = 'API customizada';
    protected missingConfigurationMessage = 'Configure o endpoint, o modelo e a API key customizada nas Definições.';

    private async getProfile(request: ProviderRequest): Promise<CustomProviderProfile | undefined> {
        const profiles = await secureStore.getCustomApiProfiles();
        return profiles.find((profile) => profile.id === (request.providerConfigId ?? request.model));
    }

    protected async getEndpoint(request: ProviderRequest) {
        return (await this.getProfile(request))?.endpoint;
    }

    protected async getApiKey(request: ProviderRequest) {
        const profileId = request.providerConfigId ?? request.model;
        return secureStore.getCustomApiKey(profileId);
    }

    protected async buildRequestBody(request: ProviderRequest) {
        const profile = await this.getProfile(request);
        if (!profile) throw new Error('Provider customizado não configurado');
        return buildCustomApiRequestBody(request, profile.model);
    }

    protected parsePayload(payload: Record<string, unknown>): StreamEvent | undefined {
        const event = payload as CustomApiPayload;
        const text = event.choices?.[0]?.delta?.content;
        if (text) return { type: 'text_delta', text };
        if (event.usage) return { type: 'usage', usage: { inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens } };
        return undefined;
    }
}

export const customApiProvider = new CustomApiProvider();

export type CustomApiTestResult = { ok: true } | { ok: false; message: string };

export async function testCustomApiConnection(configuration: CustomProviderProfile, apiKey: string): Promise<CustomApiTestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
        const response = await fetch(configuration.endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildCustomApiRequestBody({
                model: configuration.model,
                input: [{ role: 'user', content: 'Responde apenas OK.' }],
                maxOutputTokens: 1,
            }, configuration.model)),
        });
        if (!response.ok) return { ok: false, message: response.status === 401 || response.status === 403 ? 'A API key foi recusada.' : `O endpoint respondeu com HTTP ${response.status}.` };
        if (!response.body) return { ok: false, message: 'O endpoint não devolveu um stream compatível.' };
        const reader = response.body.getReader();
        await reader.read();
        await reader.cancel();
        reader.releaseLock();
        return { ok: true };
    } catch (error) {
        return { ok: false, message: error instanceof DOMException && error.name === 'AbortError' ? 'O teste excedeu o tempo limite.' : 'Não foi possível ligar ao endpoint.' };
    } finally {
        clearTimeout(timeout);
    }
}