import { buildOpenAIRequestBody } from '../src/providers/openai';

describe('OpenAI request limits', () => {
    it('sends a bounded response request without changing the prompt', () => {
        const body = buildOpenAIRequestBody({
            model: 'gpt-5.6-luna',
            input: [{ role: 'user', content: 'Pergunta de teste' }],
            maxOutputTokens: 1200,
        });

        expect(body.max_output_tokens).toBe(1200);
        expect(body.input).toEqual([{ role: 'user', content: 'Pergunta de teste' }]);
        expect(body.stream).toBe(true);
        expect(body.store).toBe(false);
    });
});
