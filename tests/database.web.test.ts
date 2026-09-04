import type { Conversation, Project } from '../src/domain/types';
import { loadAppData, saveAppData } from '../src/infrastructure/database.web';

describe('web app persistence', () => {
    beforeEach(() => {
        const data = new Map<string, string>();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => data.get(key) ?? null,
                setItem: (key: string, value: string) => data.set(key, value),
            },
        });
    });

    it('loads saved projects, conversations, and messages', () => {
        const project: Project = { id: 'project-1', name: 'Projeto', colorToken: 'terra', updatedAt: 2 };
        const conversation: Conversation = {
            id: 'conversation-1',
            projectId: project.id,
            title: 'Conversa',
            modelId: 'gpt-5.6-luna',
            updatedAt: 3,
            messages: [{ id: 'message-1', role: 'user', content: 'Olá', createdAt: 1, status: 'completed' }],
        };

        expect(loadAppData()).toEqual({ initialized: false, projects: [], conversations: [] });

        saveAppData([project], [conversation]);

        expect(loadAppData()).toEqual({ initialized: true, projects: [project], conversations: [conversation] });
    });
});