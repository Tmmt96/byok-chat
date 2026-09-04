const MAX_TITLE_LENGTH = 48;

export function createConversationTitle(content: string) {
    const normalized = content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[\*_~`#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return 'Nova conversa';
    if (normalized.length <= MAX_TITLE_LENGTH) return normalized;

    const shortened = normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd();
    const lastSpace = shortened.lastIndexOf(' ');
    return `${(lastSpace > 20 ? shortened.slice(0, lastSpace) : shortened).trim()}...`;
}