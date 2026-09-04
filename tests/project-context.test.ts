import { assembleProjectContext } from '../src/domain/project-context';
import type { Conversation, Project } from '../src/domain/types';

const project: Project = {
    id: 'p1',
    name: 'Projeto teste',
    description: 'Contexto partilhado',
    colorToken: 'terra',
    updatedAt: 1,
};

const conversations: Conversation[] = [
    {
        id: 'c1',
        projectId: 'p1',
        title: 'Primeira conversa',
        modelId: 'gpt-5.6-luna',
        updatedAt: 1,
        messages: [{ id: 'm1', role: 'user', content: 'Contexto A', createdAt: 1, status: 'completed' }],
    },
    {
        id: 'c2',
        projectId: 'p1',
        title: 'Segunda conversa',
        modelId: 'gpt-5.6-luna',
        updatedAt: 2,
        messages: [{ id: 'm2', role: 'assistant', content: 'Contexto B', createdAt: 2, status: 'completed' }],
    },
    {
        id: 'outside',
        title: 'Fora do projeto',
        modelId: 'gpt-5.6-luna',
        updatedAt: 3,
        messages: [{ id: 'm3', role: 'user', content: 'Não incluir', createdAt: 3, status: 'completed' }],
    },
];

test('assembles all project conversations plus new content', () => {
    const context = assembleProjectContext(project, conversations, [
        { id: 'new', role: 'user', content: 'Nova pergunta', createdAt: 4, status: 'completed' },
    ]);
    const serialized = context.input.map((item) => item.content).join('\\n');

    expect(serialized).toContain('Contexto A');
    expect(serialized).toContain('Contexto B');
    expect(serialized).toContain('Nova pergunta');
    expect(serialized).not.toContain('Não incluir');
    expect(context.conversationIds).toEqual(['c1', 'c2']);
});

test('marks large project context for compaction', () => {
    const context = assembleProjectContext(project, conversations, [], 1);
    expect(context.requiresCompaction).toBe(true);
});
