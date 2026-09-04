import { stripMarkdownForSpeech } from '../src/features/markdown';

describe('stripMarkdownForSpeech', () => {
    it('removes presentation markers but keeps readable content', () => {
        const source = '# Titulo\n\n**Factos**\n- Primeiro ponto\n- Segundo ponto\n\n`gpt-5.6-luna`';

        expect(stripMarkdownForSpeech(source)).toBe('Titulo\n\nFactos\nPrimeiro ponto\nSegundo ponto\n\ngpt-5.6-luna');
    });

    it('keeps link labels and code block content', () => {
        const source = '[OpenAI](https://openai.com)\n\n```text\nresposta\n```';

        expect(stripMarkdownForSpeech(source)).toBe('OpenAI\n\nresposta');
    });
});
