import { buildCustomApiRequestBody } from '../src/providers/custom-api';

describe('Custom API provider', () => {
    it('builds an OpenAI-compatible streaming request', () => {
        const body = buildCustomApiRequestBody({
            model: 'custom-api',
            input: [
                { role: 'system', content: 'Responde em português.' },
                { role: 'user', content: 'Pergunta de teste' },
            ],
            maxOutputTokens: 1200,
        }, 'local-model');

        expect(body).toEqual({
            model: 'local-model',
            messages: [
                { role: 'system', content: 'Responde em português.' },
                { role: 'user', content: 'Pergunta de teste' },
            ],
            stream: true,
            max_tokens: 1200,
        });
    });
});
