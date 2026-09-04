import { createConversationTitle } from '../src/domain/conversation-title';

describe('conversation titles', () => {
    it('uses the first message as a readable title', () => {
        expect(createConversationTitle('  **Como valido o MVP?**  ')).toBe('Como valido o MVP?');
    });

    it('shortens long messages at a word boundary', () => {
        const title = createConversationTitle('Preciso de um plano detalhado para validar o produto com utilizadores reais');

        expect(title.length).toBeLessThanOrEqual(48);
        expect(title.endsWith('...')).toBe(true);
    });
});