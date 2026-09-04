const markdownTokenPattern = /\*\*|__|~~|`/g;

export function stripMarkdownForSpeech(content: string): string {
    return content
        .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[\w-]*\n?/g, '').replace(/```/g, ''))
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(markdownTokenPattern, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
