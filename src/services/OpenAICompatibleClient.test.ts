import {
    AIRequestError,
    FetchLike,
    OpenAICompatibleClient
} from './OpenAICompatibleClient';

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    const textBody = typeof body === 'string' ? body : JSON.stringify(body);
    const normalizedHeaders = new Map(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null
        },
        text: async () => textBody,
        json: async () => JSON.parse(textBody)
    } as Response;
}

function createClient(fetchImpl: FetchLike, overrides: Record<string, unknown> = {}): OpenAICompatibleClient {
    return new OpenAICompatibleClient({
        apiKey: 'test-key',
        model: 'test-model',
        baseUrl: 'https://example.com/v1/',
        requestTimeoutMs: 100,
        maxRetries: 0,
        retryBaseDelayMs: 0,
        fetchImpl,
        ...overrides
    });
}

describe('OpenAICompatibleClient', () => {
    it('sends a compatible chat completion request and returns text', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response({ choices: [{ message: { content: 'answer' } }] }));
        const client = createClient(fetchImpl);

        await expect(client.createChatCompletion('question', {
            systemPrompt: 'system',
            temperature: 0
        })).resolves.toBe('answer');

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://example.com/v1/chat/completions');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-key' }));
        expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
            model: 'test-model',
            temperature: 0,
            messages: [
                { role: 'system', content: 'system' },
                { role: 'user', content: 'question' }
            ]
        }));
    });

    it('does not retry authentication failures', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response({ error: 'bad key' }, 401));
        const client = createClient(fetchImpl, { maxRetries: 2 });

        await expect(client.createChatCompletion('question')).rejects.toMatchObject({
            code: 'http_error',
            status: 401,
            retryable: false
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('retries rate limits and succeeds', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValueOnce(response('rate limited', 429, { 'retry-after': '0' }))
            .mockResolvedValueOnce(response({ choices: [{ message: { content: 'recovered' } }] }));
        const client = createClient(fetchImpl, { maxRetries: 1 });

        await expect(client.createChatCompletion('question')).resolves.toBe('recovered');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('stops after the configured number of server-error retries', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response('unavailable', 503));
        const client = createClient(fetchImpl, { maxRetries: 2 });

        await expect(client.createChatCompletion('question')).rejects.toMatchObject({
            code: 'http_error',
            status: 503,
            retryable: true
        });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('rejects invalid JSON responses', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response('{invalid'));
        const client = createClient(fetchImpl);

        await expect(client.createChatCompletion('question')).rejects.toMatchObject({
            code: 'invalid_response'
        });
    });

    it('rejects responses without message content', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response({ choices: [] }));
        const client = createClient(fetchImpl);

        await expect(client.createChatCompletion('question')).rejects.toMatchObject({
            code: 'invalid_response'
        });
    });

    it('aborts requests after the configured timeout', async () => {
        const fetchImpl: FetchLike = (_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
        const client = createClient(fetchImpl, { requestTimeoutMs: 5 });

        await expect(client.createChatCompletion('question')).rejects.toMatchObject({
            code: 'timeout',
            retryable: true
        });
    });

    it('honours caller cancellation', async () => {
        const fetchImpl: FetchLike = (_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
        const controller = new AbortController();
        const client = createClient(fetchImpl);
        const pending = client.createChatCompletion('question', { signal: controller.signal });
        controller.abort();

        await expect(pending).rejects.toMatchObject({ code: 'aborted' });
    });

    it('does not send a request when already cancelled', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
        const controller = new AbortController();
        controller.abort();
        const client = createClient(fetchImpl);

        await expect(client.createChatCompletion('question', { signal: controller.signal }))
            .rejects.toMatchObject({ code: 'aborted' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('validates the endpoint before sending a request', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
        const client = createClient(fetchImpl, { baseUrl: 'file:///tmp/model' });

        await expect(client.createChatCompletion('question')).rejects.toBeInstanceOf(AIRequestError);
        await expect(client.createChatCompletion('question')).rejects.toMatchObject({ code: 'invalid_config' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        ['', 'AI Base URL is empty'],
        ['not a URL', 'AI Base URL is invalid'],
        ['https://example.com/v1', 'AI model name is empty']
    ])('rejects invalid configuration: %s', async (baseUrl, expectedMessage) => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
        const client = createClient(fetchImpl, {
            baseUrl,
            model: expectedMessage.includes('model') ? ' ' : 'model'
        });

        await expect(client.createChatCompletion('question')).rejects.toThrow(expectedMessage);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('applies updated endpoint, model, and transport configuration', async () => {
        const originalFetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
        const updatedFetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response({ choices: [{ message: { content: 'updated' } }] }));
        const client = createClient(originalFetch);
        client.updateConfig({
            baseUrl: 'https://updated.example/v2',
            model: 'updated-model',
            fetchImpl: updatedFetch
        });

        await expect(client.createChatCompletion('question')).resolves.toBe('updated');
        expect(originalFetch).not.toHaveBeenCalled();
        expect(updatedFetch).toHaveBeenCalledWith(
            'https://updated.example/v2/chat/completions',
            expect.objectContaining({ body: expect.stringContaining('updated-model') })
        );
    });

    it('classifies transport failures as retryable network errors', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockRejectedValue(new Error('offline'));
        const client = createClient(fetchImpl);

        await expect(client.createChatCompletion('question')).rejects.toMatchObject({
            code: 'network_error',
            retryable: true
        });
    });

    it('supports HTTP-date Retry-After values', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValueOnce(response('retry', 429, { 'retry-after': new Date().toUTCString() }))
            .mockResolvedValueOnce(response({ choices: [{ message: { content: 'ok' } }] }));
        const client = createClient(fetchImpl, { maxRetries: 1 });

        await expect(client.createChatCompletion('question')).resolves.toBe('ok');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('cancels while waiting to retry', async () => {
        const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
            .mockResolvedValue(response('retry', 429));
        const controller = new AbortController();
        const client = createClient(fetchImpl, { maxRetries: 1, retryBaseDelayMs: 1000 });
        const pending = client.createChatCompletion('question', { signal: controller.signal });
        await Promise.resolve();
        controller.abort();

        await expect(pending).rejects.toMatchObject({ code: 'aborted' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
