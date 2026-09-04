import type { Conversation, Project } from '../domain/types';

export const seedProjects: Project[] = [
    {
        id: 'launch',
        name: 'Lançamento BYOK',
        description: 'Produto, segurança e lançamento',
        colorToken: 'terra',
        updatedAt: Date.now(),
    },
];

export const seedConversations: Conversation[] = [
    {
        id: 'launch-plan',
        projectId: 'launch',
        title: 'Plano de lançamento',
        modelId: 'gpt-5.6-luna',
        updatedAt: Date.now(),
        messages: [
            { id: 'm1', role: 'user', content: 'Quero um plano simples para validar o MVP em duas semanas.', createdAt: Date.now() - 240000, status: 'completed' },
            { id: 'm2', role: 'assistant', content: 'Começaria por uma validação técnica curta e mensurável, com um provider, streaming e testes em dispositivos físicos.', createdAt: Date.now() - 180000, status: 'completed' },
        ],
    },
    {
        id: 'newsletter',
        title: 'Ideias para a newsletter',
        modelId: 'gpt-5.6-luna',
        updatedAt: Date.now() - 86400000,
        messages: [],
    },
];
