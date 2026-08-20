import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';

// Hoisted references so vi.mock (which is hoisted to the top) can see them.
const { getMock, postMock, interceptorHandlers, createSpy } = vi.hoisted(() => {
  const getMock = vi.fn();
  const postMock = vi.fn();
  const interceptorHandlers: Array<
    (config: { headers: Record<string, string> }) => unknown
  > = [];
  const createSpy = vi.fn(() => ({
    get: getMock,
    post: postMock,
    interceptors: {
      request: {
        use: (handler: (c: { headers: Record<string, string> }) => unknown) => {
          interceptorHandlers.push(handler);
          return interceptorHandlers.length - 1;
        },
      },
    },
  }));
  return { getMock, postMock, interceptorHandlers, createSpy };
});

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: { ...actual.default, create: createSpy },
    AxiosError: actual.AxiosError,
  };
});

// Delayed import so the mock is in place first.
import { ApiClient } from '../../api/client';

describe('ApiClient', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    createSpy.mockClear();
    interceptorHandlers.length = 0;
  });

  it('strips trailing slash from baseURL and registers interceptors', () => {
    new ApiClient('https://api.example.com/', 'api-key', 'aubt_xyz');
    expect(createSpy).toHaveBeenCalledWith({
      baseURL: 'https://api.example.com',
      headers: { Accept: 'application/json' },
    });
    expect(interceptorHandlers).toHaveLength(2);

    const config = { headers: {} as Record<string, string> };
    interceptorHandlers[0](config);
    interceptorHandlers[1](config);
    expect(config.headers['X-Api-Key']).toBe('api-key');
    expect(config.headers['Authorization']).toBe('Bearer aubt_xyz');
  });

  it('getConfig returns response.data', async () => {
    const payload = {
      lift: { endpoint: 'https://tus', token: 't', bucket: 'b' },
      mode: 'uploader',
    };
    getMock.mockResolvedValueOnce({ data: payload });
    const client = new ApiClient('https://api', 'k', 'aubt_x');
    await expect(client.getConfig()).resolves.toEqual(payload);
    expect(getMock).toHaveBeenCalledWith('/uploader/config');
  });

  it('uploadInit sends mapped body and returns response.data', async () => {
    postMock.mockResolvedValueOnce({ data: { studies: [{ id: 's1' }] } });
    const client = new ApiClient('https://api', 'k', 'aubt_x');
    const out = await client.uploadInit({
      upload_id: 'u1',
      studies: {},
      patient_id: 'p1',
      context: { foo: 1 },
    });
    expect(out.studies[0].id).toBe('s1');
    expect(postMock).toHaveBeenCalledWith('/uploader/upload/init', {
      upload_id: 'u1',
      studies: {},
      mode: 'bulk',
      type: 'uploader',
      source: 'standalone-uploader',
      patient_id: 'p1',
      context: { foo: 1 },
    });
  });

  it('uploadInit applies default source and null patient_id when omitted', async () => {
    postMock.mockResolvedValueOnce({ data: { studies: [] } });
    const client = new ApiClient('https://api', 'k', 'aubt_x');
    await client.uploadInit({ upload_id: 'u1', studies: {} });
    expect(postMock.mock.calls[0][1]).toMatchObject({
      source: 'standalone-uploader',
      patient_id: null,
    });
  });

  it('uploadStart sends upload lifecycle payload with mode default', async () => {
    postMock.mockResolvedValueOnce({ data: {} });
    const client = new ApiClient('https://api', 'k', 'aubt_x');
    await client.uploadStart({ upload_id: 'u1', assembly_id: 'a1' });
    expect(postMock).toHaveBeenCalledWith('/uploader/upload/start', {
      upload_id: 'u1',
      assembly_id: 'a1',
      mode: 'uploader',
    });
  });

  it('uploadStart honours a custom mode', async () => {
    postMock.mockResolvedValueOnce({ data: {} });
    const client = new ApiClient('https://api', 'k', 'aubt_x');
    await client.uploadStart({ upload_id: 'u1', mode: 'custom' });
    expect(postMock.mock.calls[0][1].mode).toBe('custom');
  });

  it('uploadComplete / uploadCancel / uploadError post with defaults', async () => {
    postMock.mockResolvedValue({ data: {} });
    const client = new ApiClient('https://api', 'k', 'aubt_x');
    await client.uploadComplete({ upload_id: 'u1' });
    await client.uploadCancel({ upload_id: 'u1' });
    await client.uploadError({ upload_id: 'u1', message: 'boom' });
    expect(postMock.mock.calls[0]).toEqual([
      '/uploader/upload/complete',
      { upload_id: 'u1', assembly_id: undefined, mode: 'uploader' },
    ]);
    expect(postMock.mock.calls[1]).toEqual([
      '/uploader/upload/cancel',
      { upload_id: 'u1', mode: 'uploader' },
    ]);
    expect(postMock.mock.calls[2]).toEqual([
      '/uploader/upload/error',
      { upload_id: 'u1', message: 'boom', mode: 'uploader' },
    ]);
  });

  it('isAuthError recognises 401 and 403 only', () => {
    const auth401 = new AxiosError('x');
    auth401.response = { status: 401 } as never;
    const auth403 = new AxiosError('x');
    auth403.response = { status: 403 } as never;
    const other = new AxiosError('x');
    other.response = { status: 500 } as never;
    expect(ApiClient.isAuthError(auth401)).toBe(true);
    expect(ApiClient.isAuthError(auth403)).toBe(true);
    expect(ApiClient.isAuthError(other)).toBe(false);
    expect(ApiClient.isAuthError(new Error('nope'))).toBe(false);
    expect(ApiClient.isAuthError('nope')).toBe(false);
  });

  it('isAuthError returns false when the error has no response', () => {
    const err = new AxiosError('x');
    expect(ApiClient.isAuthError(err)).toBe(false);
  });

  it('getErrorMessage extracts Laravel validation errors', () => {
    const err = new AxiosError('fallback');
    err.response = {
      data: { errors: { name: ['is required'], email: ['is invalid'] } },
    } as never;
    expect(ApiClient.getErrorMessage(err)).toBe('is required, is invalid');
  });

  it('getErrorMessage extracts nested HMAC-style error.message', () => {
    const err = new AxiosError('fallback');
    err.response = {
      data: { error: { message: 'bad hmac' } },
    } as never;
    expect(ApiClient.getErrorMessage(err)).toBe('bad hmac');
  });

  it('getErrorMessage falls back to data.message', () => {
    const err = new AxiosError('fallback');
    err.response = { data: { message: 'server said no' } } as never;
    expect(ApiClient.getErrorMessage(err)).toBe('server said no');
  });

  it('getErrorMessage falls back to axios error.message when data is absent', () => {
    const err = new AxiosError('boom');
    expect(ApiClient.getErrorMessage(err)).toBe('boom');
  });

  it('getErrorMessage handles plain Error and unknown', () => {
    expect(ApiClient.getErrorMessage(new Error('oops'))).toBe('oops');
    expect(ApiClient.getErrorMessage('what')).toBe('An unknown error occurred');
  });
});
