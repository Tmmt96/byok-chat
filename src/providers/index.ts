import type { AIProviderAdapter, ProviderId, ProviderRequest, StreamEvent } from '../domain/types';
import { customApiProvider } from './custom-api';
import { openAIProvider } from './openai';

const providers: Record<ProviderId, AIProviderAdapter> = {
    openai: openAIProvider,
    custom: customApiProvider,
};

export function streamProvider(providerId: ProviderId, request: ProviderRequest, onEvent: (event: StreamEvent) => void) {
    return providers[providerId].stream(request, onEvent);
}