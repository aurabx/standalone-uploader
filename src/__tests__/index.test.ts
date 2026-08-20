import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------------
// Hoisted mocks: replace ApiClient / AuraloaderEngine / Store / Renderer.
// -----------------------------------------------------------------------------

const state = vi.hoisted(() => {
  const uploadTokenPrefix = 'aubt_';
  interface FakeApi {
    getConfig: ReturnType<typeof vi.fn>;
    uploadInit: ReturnType<typeof vi.fn>;
    uploadStart: ReturnType<typeof vi.fn>;
    uploadComplete: ReturnType<typeof vi.fn>;
    uploadError: ReturnType<typeof vi.fn>;
    uploadCancel: ReturnType<typeof vi.fn>;
  }
  interface FakeStore {
    _state: Record<string, unknown>;
    resetProcessing: ReturnType<typeof vi.fn>;
    goto: ReturnType<typeof vi.fn>;
    setError: ReturnType<typeof vi.fn>;
    setComplete: ReturnType<typeof vi.fn>;
    setZipping: ReturnType<typeof vi.fn>;
    setStudiesFromApi: ReturnType<typeof vi.fn>;
    setSummary: ReturnType<typeof vi.fn>;
    applyProcessingProgress: ReturnType<typeof vi.fn>;
    markProcessingStalled: ReturnType<typeof vi.fn>;
    toggleProcessingErrors: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  }
  interface FakeEngine {
    uppy: {
      _handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
      on: ReturnType<typeof vi.fn>;
      upload: ReturnType<typeof vi.fn>;
      cancelAll: ReturnType<typeof vi.fn>;
    };
    uniqueId: string;
    totalFiles: number;
    seriesCount: number;
    studiesCount: number;
    studiesInfo: Record<string, unknown>;
    cancelProcessing: boolean;
    setup: ReturnType<typeof vi.fn>;
    process: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    removeStudy: ReturnType<typeof vi.fn>;
    zipFiles: ReturnType<typeof vi.fn>;
    mountDragDrop: ReturnType<typeof vi.fn>;
    mountStatusBar: ReturnType<typeof vi.fn>;
  }
  interface FakeRenderer {
    mount: ReturnType<typeof vi.fn>;
    unmount: ReturnType<typeof vi.fn>;
    onRender: ReturnType<typeof vi.fn>;
    getDragDropTarget: ReturnType<typeof vi.fn>;
    getProgressTarget: ReturnType<typeof vi.fn>;
    _renderCb: ((s: unknown) => void) | null;
  }
  const apis: FakeApi[] = [];
  const stores: FakeStore[] = [];
  const engines: FakeEngine[] = [];
  const renderers: FakeRenderer[] = [];
  return {
    uploadTokenPrefix,
    apis,
    stores,
    engines,
    renderers,
    isAuthError: vi.fn(() => false),
    getErrorMessage: vi.fn((err: unknown) => (err as Error)?.message ?? 'oops'),
    makeApi(): FakeApi {
      const api: FakeApi = {
        getConfig: vi.fn().mockResolvedValue({
          lift: { endpoint: 'https://tus', token: 't', bucket: 'b' },
          mode: 'uploader',
        }),
        uploadInit: vi.fn().mockResolvedValue({ studies: [] }),
        uploadStart: vi.fn().mockResolvedValue(undefined),
        uploadComplete: vi.fn().mockResolvedValue(undefined),
        uploadError: vi.fn().mockResolvedValue(undefined),
        uploadCancel: vi.fn().mockResolvedValue(undefined),
      };
      apis.push(api);
      return api;
    },
    makeStore(): FakeStore {
      const store: FakeStore = {
        _state: { step: 'start' },
        resetProcessing: vi.fn(),
        goto: vi.fn(),
        setError: vi.fn(),
        setComplete: vi.fn(),
        setZipping: vi.fn(),
        setStudiesFromApi: vi.fn(),
        setSummary: vi.fn(),
        applyProcessingProgress: vi.fn(),
        markProcessingStalled: vi.fn(),
        toggleProcessingErrors: vi.fn(),
        reset: vi.fn(),
        getState: vi.fn(() => store._state),
        subscribe: vi.fn(() => () => undefined),
      };
      stores.push(store);
      return store;
    },
    makeEngine(): FakeEngine {
      const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
      const engine: FakeEngine = {
        uppy: {
          _handlers: handlers,
          on: vi.fn((evt: string, fn: (...args: unknown[]) => unknown) => {
            const list = handlers.get(evt) ?? [];
            list.push(fn);
            handlers.set(evt, list);
          }),
          upload: vi.fn().mockResolvedValue(undefined),
          cancelAll: vi.fn(),
        },
        uniqueId: 'unique-id',
        totalFiles: 0,
        seriesCount: 0,
        studiesCount: 0,
        studiesInfo: {},
        cancelProcessing: false,
        setup: vi.fn().mockResolvedValue(undefined),
        process: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
        removeStudy: vi.fn().mockResolvedValue(undefined),
        zipFiles: vi.fn().mockResolvedValue(undefined),
        mountDragDrop: vi.fn(),
        mountStatusBar: vi.fn(),
      };
      engines.push(engine);
      return engine;
    },
    makeRenderer(): FakeRenderer {
      const r: FakeRenderer = {
        mount: vi.fn(),
        unmount: vi.fn(),
        onRender: vi.fn((cb: (s: unknown) => void) => {
          r._renderCb = cb;
        }),
        getDragDropTarget: vi.fn(() => '#drop'),
        getProgressTarget: vi.fn(() => '#status'),
        _renderCb: null,
      };
      renderers.push(r);
      return r;
    },
    reset() {
      this.apis.length = 0;
      this.stores.length = 0;
      this.engines.length = 0;
      this.renderers.length = 0;
      this.isAuthError.mockReset().mockReturnValue(false);
      this.getErrorMessage
        .mockReset()
        .mockImplementation((err) => (err as Error)?.message ?? 'oops');
    },
  };
});

vi.mock('../api/client', () => ({
  ApiClient: class {
    constructor() {
      return state.makeApi() as unknown as object;
    }
    static isAuthError(err: unknown) {
      return state.isAuthError(err);
    }
    static getErrorMessage(err: unknown) {
      return state.getErrorMessage(err);
    }
  },
}));

vi.mock('../core/AuraloaderEngine', () => ({
  AuraloaderEngine: class {
    constructor() {
      return state.makeEngine() as unknown as object;
    }
  },
}));

vi.mock('../ui/Store', () => ({
  Store: class {
    constructor() {
      return state.makeStore() as unknown as object;
    }
  },
}));

vi.mock('../ui/Renderer', () => ({
  Renderer: class {
    constructor() {
      return state.makeRenderer() as unknown as object;
    }
  },
}));

// SUT (import after mocks)
import { StandaloneAuraloader } from '../index';
import type { AuraloaderConfig } from '../types';

function baseConfig(overrides: Partial<AuraloaderConfig> = {}): AuraloaderConfig {
  return {
    apiToken: 'api-token',
    apiBaseUrl: 'https://api.example.com',
    containerId: 'uploader',
    uploadToken: 'aubt_xyz',
    ...overrides,
  };
}

beforeEach(() => {
  state.reset();
  document.body.innerHTML = '<div id="uploader"></div>';
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StandaloneAuraloader — configuration validation', () => {
  it('requires apiToken', () => {
    expect(() => new StandaloneAuraloader(baseConfig({ apiToken: '' })))
      .toThrow('apiToken is required');
  });
  it('requires apiBaseUrl', () => {
    expect(() => new StandaloneAuraloader(baseConfig({ apiBaseUrl: '' })))
      .toThrow('apiBaseUrl is required');
  });
  it('requires containerId', () => {
    expect(() => new StandaloneAuraloader(baseConfig({ containerId: '' })))
      .toThrow('containerId is required');
  });
  it('requires uploadToken', () => {
    expect(() => new StandaloneAuraloader(baseConfig({ uploadToken: '' })))
      .toThrow('uploadToken is required');
  });
  it('rejects an invalid URL', () => {
    expect(() => new StandaloneAuraloader(baseConfig({ apiBaseUrl: 'not-a-url' })))
      .toThrow('apiBaseUrl must be a valid URL');
  });
  it('rejects an upload token missing the aubt_ prefix', () => {
    expect(() => new StandaloneAuraloader(baseConfig({ uploadToken: 'xxx' })))
      .toThrow("uploadToken must start with 'aubt_'");
  });
});

describe('StandaloneAuraloader.init', () => {
  it('throws with a friendly message on auth errors', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    state.apis[0].getConfig.mockRejectedValueOnce(new Error('boom'));
    state.isAuthError.mockReturnValueOnce(true);
    await expect(loader.init()).rejects.toThrow(
      'Authentication failed. Check your upload token.',
    );
  });

  it('wraps other init errors', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    state.apis[0].getConfig.mockRejectedValueOnce(new Error('connect refused'));
    await expect(loader.init()).rejects.toThrow(
      /Server connectivity failed: connect refused/,
    );
  });

  it('validates the server response for missing fields', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    // First call succeeds so validateEndpoint passes; second returns bad config.
    state.apis[0].getConfig
      .mockResolvedValueOnce({
        lift: { endpoint: 'https://tus', token: 't', bucket: 'b' },
        mode: 'uploader',
      })
      .mockResolvedValueOnce({ lift: null } as never);
    await expect(loader.init()).rejects.toThrow(
      'Server config missing lift configuration',
    );
  });

  it('rejects missing lift.endpoint / lift.token / lift.bucket / mode', async () => {
    for (const [patch, message] of [
      [
        { lift: { endpoint: '', token: 't', bucket: 'b' }, mode: 'u' },
        'Server config missing or invalid lift.endpoint',
      ],
      [
        { lift: { endpoint: 'e', token: '', bucket: 'b' }, mode: 'u' },
        'Server config missing or invalid lift.token',
      ],
      [
        { lift: { endpoint: 'e', token: 't', bucket: '' }, mode: 'u' },
        'Server config missing or invalid lift.bucket',
      ],
      [
        { lift: { endpoint: 'e', token: 't', bucket: 'b' }, mode: '' },
        'Server config missing or invalid mode',
      ],
    ] as const) {
      state.reset();
      document.body.innerHTML = '<div id="uploader"></div>';
      const loader = new StandaloneAuraloader(baseConfig());
      state.apis[0].getConfig
        .mockResolvedValueOnce({
          lift: { endpoint: 'e', token: 't', bucket: 'b' },
          mode: 'u',
        })
        .mockResolvedValueOnce(patch as never);
      await expect(loader.init()).rejects.toThrow(message);
    }
  });

  it('throws when the container element is not in the DOM', async () => {
    document.body.innerHTML = '';
    const loader = new StandaloneAuraloader(baseConfig());
    await expect(loader.init()).rejects.toThrow(
      'Container element with id "uploader" not found in DOM',
    );
  });

  it('warns when the container already has children', async () => {
    document.body.innerHTML =
      '<div id="uploader"><span>hi</span></div>';
    const loader = new StandaloneAuraloader(baseConfig());
    await loader.init();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('is not empty'),
    );
  });

  it('happy path: creates the renderer, engine, wires events, marks initialized', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    await loader.init();
    expect(state.renderers).toHaveLength(1);
    expect(state.engines).toHaveLength(1);
    expect(state.engines[0].setup).toHaveBeenCalled();
    // Every documented handler is registered.
    const registered = [...state.engines[0].uppy._handlers.keys()];
    expect(registered.sort()).toEqual([
      'cancel-all',
      'complete',
      'error',
      'files-added',
      'upload',
      'upload-error',
    ]);
    // A second init warns and is a no-op.
    await loader.init();
    expect(console.warn).toHaveBeenCalledWith(
      'StandaloneAuraloader already initialized',
    );
  });
});

describe('StandaloneAuraloader.mount', () => {
  it('throws when init has not run', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    await expect(loader.mount()).rejects.toThrow(
      'Must call init() before mount()',
    );
  });

  it('registers an onRender callback that remounts plugins per step', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    await loader.init();
    await loader.mount();
    const cb = state.renderers[0]._renderCb!;
    expect(cb).toBeTypeOf('function');
    cb({ step: 'start' });
    cb({ step: 'pending' });
    cb({ step: 'uploading' });
    expect(state.engines[0].mountDragDrop).toHaveBeenCalledTimes(2);
    expect(state.engines[0].mountStatusBar).toHaveBeenCalledTimes(1);
    expect(state.renderers[0].mount).toHaveBeenCalled();
  });
});

describe('StandaloneAuraloader — engine event wiring', () => {
  async function bootLoader() {
    const loader = new StandaloneAuraloader(baseConfig());
    await loader.init();
    await loader.mount();
    return loader;
  }

  it('files-added: zip-only batches are ignored', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/zip' }]);
    expect(store.goto).not.toHaveBeenCalledWith('processing');
  });

  it('files-added: happy path moves to processing then pending, and forwards progress ticks', async () => {
    await bootLoader();
    const engine = state.engines[0];
    engine.totalFiles = 3;
    const store = state.stores[0];
    // Feed a synthetic progress tick so the onProgress branch runs.
    engine.process.mockImplementationOnce(async (cb: (p: unknown) => void) => {
      cb?.({ current: 1, total: 3, phase: 'reading', outcome: 'accepted' });
    });
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/dicom' }]);
    expect(store.resetProcessing).toHaveBeenCalled();
    expect(store.goto).toHaveBeenCalledWith('processing');
    expect(engine.process).toHaveBeenCalled();
    expect(store.applyProcessingProgress).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'accepted' }),
    );
    expect(store.setSummary).toHaveBeenCalled();
    expect(store.goto).toHaveBeenCalledWith('pending');
  });

  it('files-added: cancellation resets and returns silently', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    engine.process.mockImplementationOnce(async () => {
      const err = new DOMException('cancel', 'AbortError');
      throw err;
    });
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/dicom' }]);
    expect(engine.reset).toHaveBeenCalled();
    expect(store.reset).toHaveBeenCalled();
    expect(store.setError).not.toHaveBeenCalled();
  });

  it('files-added: process failure sets an error', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    engine.process.mockRejectedValueOnce(new Error('parse blew up'));
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/dicom' }]);
    expect(store.setError).toHaveBeenCalledWith('parse blew up');
  });

  it('files-added: process failure without a message uses the default', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    engine.process.mockRejectedValueOnce({} as never);
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/dicom' }]);
    expect(store.setError).toHaveBeenCalledWith('Processing failed');
  });

  it('files-added: zero valid files surfaces the "not DICOM" message', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    engine.totalFiles = 0;
    store._state = { ...store._state, processingFailed: 0 };
    store.getState.mockReturnValue(store._state);
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/dicom' }]);
    expect(store.setError).toHaveBeenCalledWith(
      'None of the selected files are valid DICOM imaging.',
    );
  });

  it('files-added: zero valid files but some failed uses the "unreadable" message', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    engine.totalFiles = 0;
    store._state = { ...store._state, processingFailed: 3 };
    store.getState.mockReturnValue(store._state);
    const handler = engine.uppy._handlers.get('files-added')![0];
    await handler([{ type: 'application/dicom' }]);
    expect(store.setError).toHaveBeenCalledWith(
      'None of the selected files could be read as DICOM imaging.',
    );
  });

  it('upload event: reports start to the API; catches failures', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const api = state.apis[0];
    const store = state.stores[0];
    const handler = engine.uppy._handlers.get('upload')![0];
    await handler('assembly-1');
    expect(api.uploadStart).toHaveBeenCalledWith({
      upload_id: 'unique-id',
      assembly_id: 'assembly-1',
      mode: 'uploader',
    });

    api.uploadStart.mockRejectedValueOnce(new Error('nope'));
    await handler('assembly-1');
    expect(store.setError).toHaveBeenCalled();
  });

  it('complete event: reports completion and fires callback', async () => {
    const callbacks = { onUploadComplete: vi.fn() };
    const loader = new StandaloneAuraloader(baseConfig({ callbacks }));
    await loader.init();
    await loader.mount();
    const engine = state.engines[0];
    const api = state.apis[0];
    const handler = engine.uppy._handlers.get('complete')![0];
    await handler({ uploadID: 'a', successful: [1], failed: [] });
    expect(api.uploadComplete).toHaveBeenCalled();
    expect(callbacks.onUploadComplete).toHaveBeenCalledWith(
      expect.objectContaining({ successful: 1, failed: 0 }),
    );
  });

  it('complete event: fallback path for successful/failed counts when missing', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const handler = engine.uppy._handlers.get('complete')![0];
    await handler({});
    expect(state.stores[0].setComplete).toHaveBeenCalledWith(true);
  });

  it('complete event: API failure sets an error', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const api = state.apis[0];
    const store = state.stores[0];
    api.uploadComplete.mockRejectedValueOnce(new Error('boom'));
    const handler = engine.uppy._handlers.get('complete')![0];
    await handler({ uploadID: 'a', successful: [], failed: [] });
    expect(store.setError).toHaveBeenCalled();
  });

  it('upload-error: 401 / 403 / other status paths', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    const handler = engine.uppy._handlers.get('upload-error')![0];

    await handler({}, new Error('e'), { status: 401 });
    expect(store.setError).toHaveBeenLastCalledWith(
      'Authentication failed. Please refresh and try again.',
    );
    await handler({}, new Error('e'), { status: 403 });
    expect(store.setError).toHaveBeenLastCalledWith(
      'Permission denied. Contact your administrator.',
    );
    await handler({}, new Error('generic'), { status: 500 });
    expect(store.setError).toHaveBeenLastCalledWith('generic');
    // Missing message → 'Upload failed'
    await handler({}, {} as never, { status: 500 });
    expect(store.setError).toHaveBeenLastCalledWith('Upload failed');
  });

  it('error event: reports and resets the engine', async () => {
    await bootLoader();
    const engine = state.engines[0];
    const api = state.apis[0];
    const store = state.stores[0];
    const handler = engine.uppy._handlers.get('error')![0];
    await handler(new Error('kaboom'));
    expect(api.uploadError).toHaveBeenCalled();
    expect(engine.reset).toHaveBeenCalled();
    expect(store.setError).toHaveBeenCalledWith('kaboom');

    // API failure inside the handler is swallowed.
    api.uploadError.mockRejectedValueOnce(new Error('api dead'));
    await handler(new Error('kaboom2'));
    expect(console.error).toHaveBeenCalled();
  });

  it('cancel-all event: only reacts during uploading', async () => {
    const callbacks = { onUploadCancel: vi.fn() };
    const loader = new StandaloneAuraloader(baseConfig({ callbacks }));
    await loader.init();
    await loader.mount();
    const engine = state.engines[0];
    const store = state.stores[0];
    const handler = engine.uppy._handlers.get('cancel-all')![0];
    // Not uploading → no-op
    store._state = { step: 'processing' };
    store.getState.mockReturnValue(store._state);
    await handler();
    expect(store.goto).not.toHaveBeenCalledWith('cancelled');

    // Uploading → transitions and calls API + callback
    store._state = { step: 'uploading' };
    store.getState.mockReturnValue(store._state);
    await handler();
    expect(store.goto).toHaveBeenCalledWith('cancelled');
    expect(state.apis[0].uploadCancel).toHaveBeenCalled();
    expect(callbacks.onUploadCancel).toHaveBeenCalled();

    // API failure is swallowed
    state.apis[0].uploadCancel.mockRejectedValueOnce(new Error('nope'));
    await handler();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('StandaloneAuraloader — UI events and lifecycle', () => {
  async function bootLoader(cfg: Partial<AuraloaderConfig> = {}) {
    const loader = new StandaloneAuraloader(baseConfig(cfg));
    await loader.init();
    await loader.mount();
    return loader;
  }

  it('sal:* CustomEvents dispatch through to the correct methods', async () => {
    const callbacks = { onUploadCancel: vi.fn(), onUploadComplete: vi.fn() };
    const loader = await bootLoader({ callbacks });
    const container = document.getElementById('uploader')!;
    const engine = state.engines[0];
    const store = state.stores[0];

    // sal:removeStudy → engine.removeStudy
    container.dispatchEvent(
      new CustomEvent('sal:removeStudy', { detail: { uid: 'S1' } }),
    );
    await Promise.resolve();
    expect(engine.removeStudy).toHaveBeenCalledWith('S1');

    // sal:upload → triggers upload flow (mock uploadInit already resolves)
    container.dispatchEvent(new CustomEvent('sal:upload'));
    await new Promise((r) => setTimeout(r, 0));
    expect(state.apis[0].uploadInit).toHaveBeenCalled();
    expect(engine.zipFiles).toHaveBeenCalled();

    // sal:cancel → callback only
    container.dispatchEvent(new CustomEvent('sal:cancel'));
    expect(callbacks.onUploadCancel).toHaveBeenCalled();

    // sal:cancelUpload → uppy.cancelAll
    container.dispatchEvent(new CustomEvent('sal:cancelUpload'));
    await Promise.resolve();
    expect(engine.uppy.cancelAll).toHaveBeenCalled();

    // sal:cancelProcessing → sets flag
    container.dispatchEvent(new CustomEvent('sal:cancelProcessing'));
    expect(engine.cancelProcessing).toBe(true);

    // sal:toggleProcessingErrors → store.toggleProcessingErrors
    container.dispatchEvent(new CustomEvent('sal:toggleProcessingErrors'));
    expect(store.toggleProcessingErrors).toHaveBeenCalled();

    // sal:reset → engine.setup + engine.reset + store.reset
    container.dispatchEvent(new CustomEvent('sal:reset'));
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.setup).toHaveBeenCalledTimes(2); // once in init, once here
    expect(engine.reset).toHaveBeenCalled();
    expect(store.reset).toHaveBeenCalled();

    // sal:done → onUploadComplete
    store._state = { step: 'complete', totalFiles: 5 };
    store.getState.mockReturnValue(store._state);
    container.dispatchEvent(new CustomEvent('sal:done'));
    expect(callbacks.onUploadComplete).toHaveBeenCalledWith(
      expect.objectContaining({ successful: 5, failed: 0 }),
    );
  });

  it('setupUIEvents no-ops when the container disappeared', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    await loader.init();
    document.getElementById('uploader')!.remove();
    // Should complete without throwing.
    await loader.mount();
  });

  it('upload flow: prevents re-entry', async () => {
    const loader = await bootLoader();
    const api = state.apis[0];
    let resolveInit!: (v: unknown) => void;
    api.uploadInit.mockReturnValueOnce(
      new Promise((r) => {
        resolveInit = r;
      }),
    );
    const first = loader.upload();
    await loader.upload(); // ignored while first in flight
    resolveInit({ studies: [{ id: 'S1' }] });
    await first;
    expect(api.uploadInit).toHaveBeenCalledTimes(1);
    expect(state.stores[0].setStudiesFromApi).toHaveBeenCalledWith([
      { id: 'S1' },
    ]);
  });

  it('upload flow: throws when the engine is missing', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    await expect(loader.upload()).rejects.toThrow('Engine not initialized');
  });

  it('upload flow: surfaces server errors with response bodies', async () => {
    const loader = await bootLoader();
    const api = state.apis[0];
    const err = Object.assign(new Error('bad'), {
      response: { data: { detail: 'stack' } },
    });
    api.uploadInit.mockRejectedValueOnce(err);
    await loader.upload();
    expect(state.stores[0].setError).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Server response:',
      expect.anything(),
    );
  });

  it('upload flow: also handles errors without a response body', async () => {
    const loader = await bootLoader();
    const api = state.apis[0];
    api.uploadInit.mockRejectedValueOnce(new Error('bare error'));
    await loader.upload();
    expect(state.stores[0].setError).toHaveBeenCalled();
    // Only the "Upload failed:" prefix log — no "Server response:" line.
    const calls = (console.error as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]).includes('Server response:')),
    ).toBe(false);
  });

  it('cancel / cancelProcessing / removeStudy / destroy short-circuit before init', async () => {
    const loader = new StandaloneAuraloader(baseConfig());
    await loader.cancel();
    loader.cancelProcessing();
    await loader.reset();
    await loader.removeStudy('S1');
    loader.destroy();
    // No throws; no engine calls (there is no engine).
    expect(state.engines).toHaveLength(0);
  });

  it('destroy tears down renderer, engine, and clears initialised flag', async () => {
    const loader = await bootLoader();
    loader.destroy();
    expect(state.renderers[0].unmount).toHaveBeenCalled();
    expect(state.engines[0].uppy.cancelAll).toHaveBeenCalled();
    // A subsequent init should re-run (flag cleared).
    await loader.init();
    expect(state.renderers).toHaveLength(2);
  });

  it('removeStudy delegates and rebuilds the summary', async () => {
    const loader = await bootLoader();
    await loader.removeStudy('S1');
    expect(state.engines[0].removeStudy).toHaveBeenCalledWith('S1');
    expect(state.stores[0].setSummary).toHaveBeenCalled();
  });

  it('stall watchdog trips markProcessingStalled after the limit', async () => {
    vi.useFakeTimers();
    await bootLoader();
    const engine = state.engines[0];
    const store = state.stores[0];
    // Keep engine.process pending so the watchdog runs.
    let releaseProcess!: () => void;
    engine.process.mockImplementationOnce(
      () => new Promise<void>((r) => (releaseProcess = r)),
    );
    const handler = engine.uppy._handlers.get('files-added')![0];
    const p = handler([{ type: 'application/dicom' }]);
    // Advance past the 20s stall limit.
    await vi.advanceTimersByTimeAsync(25_000);
    expect(store.markProcessingStalled).toHaveBeenCalledWith(true);
    releaseProcess();
    await p;
    // Cleanup call clears the stall flag.
    expect(store.markProcessingStalled).toHaveBeenLastCalledWith(false);
  });
});
