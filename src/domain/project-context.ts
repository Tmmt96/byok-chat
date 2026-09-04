import type { Conversation, Message, Project } from './types';

export type ProjectContext = {
    input: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    estimatedInputTokens: number;
    conversationIds: string[];
    requiresCompaction: boolean;
    fingerprint: string;
};

const approximateTokens = (text: string) => Math.ceil(text.length / 4);

const flattenMessages = (conversation: Conversation): Array<{ role: 'user' | 'assistant'; content: string }> =>
    conversation.messages
        .slice()
        .sort((first, second) => first.createdAt - second.createdAt)
        .map((message: Message) => ({ role: message.role, content: message.content }));

export function assembleProjectContext(
    project: Project,
    conversations: Conversation[],
    newMessages: Message[],
    compactThreshold = 180_000,
): ProjectContext {
    const projectConversations = conversations
        .filter((conversation) => conversation.projectId === project.id)
        .sort((first, second) => first.updatedAt - second.updatedAt);

    const input: ProjectContext['input'] = [
        {
            role: 'system',
            content: `Projeto: ${project.name}${project.description ? `\nInstruções: ${project.description}` : ''}`,
        },
    ];

    for (const conversation of projectConversations) {
        input.push({ role: 'system', content: `Início da conversa: ${conversation.title}` });
        input.push(...flattenMessages(conversation));
        input.push({ role: 'system', content: `Fim da conversa: ${conversation.title}` });
    }

    input.push(...newMessages.map(({ role, content }) => ({ role, content })));

    const serialized = input.map((item) => `${item.role}:${item.content}`).join('\n');
    return {
        input,
        estimatedInputTokens: approximateTokens(serialized),
        conversationIds: projectConversations.map((conversation) => conversation.id),
        requiresCompaction: approximateTokens(serialized) >= compactThreshold,
        fingerprint: `${project.id}:${projectConversations.map((conversation) => `${conversation.id}-${conversation.updatedAt}`).join('|')}`,
    };
}
