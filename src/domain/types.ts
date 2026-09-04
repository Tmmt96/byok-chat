export type ResponseMode = 'text' | 'voice';

export type ProviderId = 'openai' | 'custom';

export type CustomProviderProfile = {
    id: string;
    name: string;
    endpoint: string;
    model: string;
};

export type Project = {
    id: string;
    name: string;
    description?: string;
    colorToken: 'terra' | 'barro' | 'sunset' | 'pomegranate';
    updatedAt: number;
};

export type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: number;
    status: 'completed' | 'streaming' | 'failed';
};

export type Conversation = {
    id: string;
    projectId?: string;
    title: string;
    modelId: string;
    updatedAt: number;
    messages: Message[];
};

export type ProviderError = {
    code: 'authentication' | 'quota' | 'rate_limit' | 'invalid_request' | 'network' | 'provider' | 'unknown';
    message: string;
    retryable: boolean;
};

export type ProviderRequest = {
    model: string;
    input: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    maxOutputTokens?: number;
    providerConfigId?: string;
    signal?: AbortSignal;
};

export type ProviderUsage = {
    inputTokens?: number;
    outputTokens?: number;
};

export type StreamEvent =
    | { type: 'text_delta'; text: string }
    | { type: 'usage'; usage: ProviderUsage }
    | { type: 'done' }
    | { type: 'error'; error: ProviderError };

export type AIProviderAdapter = {
    readonly id: ProviderId;
    stream(request: ProviderRequest, onEvent: (event: StreamEvent) => void): Promise<void>;
};
