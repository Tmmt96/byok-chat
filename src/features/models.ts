import type { ProviderId } from '../domain/types';

export type ModelDefinition = {
    id: string;
    name: string;
    provider: string;
    providerId: ProviderId;
    contextWindow: number;
};

export const initialModel: ModelDefinition = {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    providerId: 'openai',
    contextWindow: 1_050_000,
};

export const customApiModel: ModelDefinition = {
    id: 'custom-api',
    name: 'API customizada',
    provider: 'API compatível com OpenAI',
    providerId: 'custom',
    contextWindow: 128_000,
};

export const availableModels: ModelDefinition[] = [initialModel, customApiModel];

export const maxResponseTokens = 1200;
