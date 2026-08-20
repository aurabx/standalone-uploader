import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------------
// Hoisted mocks
// -----------------------------------------------------------------------------

const uppyState = vi.hoisted(() => {
  interface FakeUppy {
    _files: Array<{ id: string; name: string; type?: string; data?: unknown; meta: Record<string, unknown> }>;
    _plugins: Map<string, unknown>;
    _handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
    on: ReturnType<typeof vi.fn>;
    use: ReturnType<typeof vi.fn>;
    getPlugin: ReturnType<typeof vi.fn>;
    removePlugin: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
    setFileMeta: ReturnType<typeof vi.fn>;
    getFiles: ReturnType<typeof vi.fn>;
    removeFile: ReturnType<typeof vi.fn>;
    addFile: ReturnType<typeof vi.fn>;
    cancelAll: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
  }
  const instances: FakeUppy[] = [];
  const makeFakeUppy = (): FakeUppy => {
    const files: FakeUppy['_files'] = [];
    const plugins = new Map<string, unknown>();
    const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
    const uppy: FakeUppy = {
      _files: files,
      _plugins: plugins,
      _handlers: handlers,
      on: vi.fn((evt: string, fn: (...args: unknown[]) => unknown) => {
        const list = handlers.get(evt) ?? [];
        list.push(fn);
        handlers.set(evt, list);
        return uppy;
      }),
      use: vi.fn((plugin: string, opts?: unknown) => {
        plugins.set(plugin, opts);
        // Real Uppy indexes plugins by their friendly name; the engine looks
        // up by 'DragDrop'/'StatusBar'/'Tus'. Mirror that mapping here.
        const nameMap: Record<string, string> = {
          DragDropPlugin: 'DragDrop',
          StatusBarPlugin: 'StatusBar',
          TusPlugin: 'Tus',
        };
        if (nameMap[plugin]) plugins.set(nameMap[plugin], opts ?? {});
        return uppy;
      }),
      getPlugin: vi.fn((name: string) => plugins.get(name)),
      removePlugin: vi.fn((plugin: unknown) => {
        for (const [k, v] of plugins) {
          if (v === plugin || k === plugin) plugins.delete(k);
        }
      }),
      setMeta: vi.fn(),
      setFileMeta: vi.fn((id: string, patch: Record<string, unknown>) => {
        const f = files.find((f) => f.id === id);
        if (f) f.meta = { ...f.meta, ...patch };
      }),
      // Return a fresh copy so callers can iterate while we mutate.
      getFiles: vi.fn(() => [...files]),
      removeFile: vi.fn((id: string) => {
        const i = files.findIndex((f) => f.id === id);
        if (i >= 0) files.splice(i, 1);
      }),
      addFile: vi.fn((file: { name: string; type: string; data: unknown; source: string }) => {
        files.push({ id: `added-${files.length}`, name: file.name, type: file.type, data: file.data, meta: {} });
      }),
      cancelAll: vi.fn(),
      upload: vi.fn(async () => ({ successful: [], failed: [] })),
    };
    instances.push(uppy);
    return uppy;
  };
  return { instances, makeFakeUppy };
});

vi.mock('@uppy/core', () => ({
  Uppy: class {
    constructor() {
      return uppyState.makeFakeUppy() as unknown as object;
    }
  },
  Meta: class {},
  UppyFile: class {},
  Body: class {},
}));
vi.mock('@uppy/drag-drop', () => ({ default: 'DragDropPlugin' }));
vi.mock('@uppy/status-bar', () => ({ default: 'StatusBarPlugin' }));
vi.mock('@uppy/tus', () => ({ default: 'TusPlugin' }));
vi.mock('../../styles.css', () => ({}));

const zipState = vi.hoisted(() => {
  const added: Array<{ name: string; data: unknown }> = [];
  return {
    added,
    reset() {
      this.added.length = 0;
    },
  };
});

vi.mock('@zip.js/zip.js', () => {
  const BlobWriter = vi.fn(function () {
    return {
      getData: async () => new Blob([new Uint8Array([1, 2, 3])]),
    };
  });
  const BlobReader = vi.fn(function (blob: unknown) {
    return { _blob: blob };
  });
  const ZipWriter = vi.fn(function () {
    return {
      add: vi.fn(async (name: string, data: unknown) => {
        zipState.added.push({ name, data });
      }),
      close: vi.fn(async () => undefined),
    };
  });
  return { BlobWriter, BlobReader, ZipWriter };
});

const parserState = vi.hoisted(() => {
  return {
    parseDicom: vi.fn(),
    reset() {
      this.parseDicom.mockReset();
    },
  };
});

vi.mock('dicom-parser', () => ({
  default: { parseDicom: (...args: unknown[]) => parserState.parseDicom(...args) },
}));

const readDicomState = vi.hoisted(() => {
  return {
    readDicom: vi.fn(async () => new ArrayBuffer(4)),
    reset() {
      this.readDicom.mockReset();
      this.readDicom.mockImplementation(async () => new ArrayBuffer(4));
    },
  };
});

vi.mock('../../core/dicom', async () => {
  const actual = await vi.importActual<typeof import('../../core/dicom')>(
    '../../core/dicom',
  );
  return {
    ...actual,
    readDicom: (...args: unknown[]) => readDicomState.readDicom(...args),
  };
});

// -----------------------------------------------------------------------------
// SUT
// -----------------------------------------------------------------------------

import { AuraloaderEngine, type EngineConfig } from '../../core/AuraloaderEngine';
import { dicomMap, dicomRejects } from '../../core/dicom';

function makeConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    dragDrop: { target: '#drop' },
    statusBar: { target: '#status' },
    lift: {
      endpoint: 'https://tus.example.com',
      token: 'lift-token',
      bucket: 'bucket-1',
    },
    mode: 'uploader',
    ...overrides,
  };
}

function makeDataSet(strings: Record<string, string>, warnings: unknown[] = []) {
  return {
    elements: Object.fromEntries(
      Object.keys(strings).map((k) => [k, { length: strings[k].length }]),
    ),
    warnings,
    string: (tag: string) => strings[tag],
    uint16: () => undefined,
    uint32: () => undefined,
  };
}

beforeEach(() => {
  uppyState.instances.length = 0;
  zipState.reset();
  parserState.reset();
  readDicomState.reset();
  document.body.innerHTML =
    '<div id="drop"></div><div id="status"></div>';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuraloaderEngine — construction & mounting', () => {
  it('constructs Uppy with the expected locale and meta, and mounts both plugins', () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    expect(engine.uniqueId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    // DragDrop + StatusBar mounted (target elements exist).
    expect(uppy.use).toHaveBeenCalledWith(
      'DragDropPlugin',
      expect.objectContaining({ target: '#drop' }),
    );
    expect(uppy.use).toHaveBeenCalledWith(
      'StatusBarPlugin',
      expect.objectContaining({ target: '#status' }),
    );
  });

  it('skips mounting when the target element is absent', () => {
    document.body.innerHTML = '';
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    expect(uppy.use).not.toHaveBeenCalledWith('DragDropPlugin', expect.anything());
    expect(uppy.use).not.toHaveBeenCalledWith('StatusBarPlugin', expect.anything());
    expect(engine).toBeInstanceOf(AuraloaderEngine);
  });

  it('remounts DragDrop and StatusBar plugins if already present', () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    // getPlugin will now return truthy since first mount registered them.
    engine.mountDragDrop();
    engine.mountStatusBar();
    expect(uppy.removePlugin).toHaveBeenCalledTimes(2);
  });

  it('applies configured locale overrides for DragDrop', () => {
    const engine = new AuraloaderEngine(
      makeConfig({
        dragDrop: {
          target: '#drop',
          locale: { strings: { dropHereOr: 'here!', browse: 'pick' } },
        },
      }),
    );
    void engine;
    const uppy = uppyState.instances.at(-1)!;
    const [, opts] = uppy.use.mock.calls.find(
      ([name]) => name === 'DragDropPlugin',
    )!;
    expect((opts as { locale: { strings: { dropHereOr: string; browse: string } } }).locale.strings)
      .toEqual({ dropHereOr: 'here!', browse: 'pick' });
  });
});

describe('AuraloaderEngine.setup', () => {
  it('sets Tus limit to 50 on fast connections and 10 on slow', async () => {
    const nav = navigator as Navigator & { connection?: { downlink?: number } };
    const original = nav.connection;

    Object.defineProperty(nav, 'connection', {
      configurable: true,
      value: { downlink: 20 },
    });
    const fast = new AuraloaderEngine(makeConfig());
    await fast.setup();
    const fastUppy = uppyState.instances.at(-1)!;
    const [, fastOpts] = fastUppy.use.mock.calls.find(
      ([name]) => name === 'TusPlugin',
    )!;
    expect((fastOpts as { limit: number }).limit).toBe(50);

    Object.defineProperty(nav, 'connection', {
      configurable: true,
      value: { downlink: 1 },
    });
    const slow = new AuraloaderEngine(makeConfig());
    await slow.setup();
    const slowUppy = uppyState.instances.at(-1)!;
    const [, slowOpts] = slowUppy.use.mock.calls.find(
      ([name]) => name === 'TusPlugin',
    )!;
    expect((slowOpts as { limit: number }).limit).toBe(10);

    if (original === undefined) {
      delete (nav as { connection?: unknown }).connection;
    } else {
      Object.defineProperty(nav, 'connection', {
        configurable: true,
        value: original,
      });
    }
  });

  it('setup() adds the Authorization header via onBeforeRequest', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    await engine.setup();
    const uppy = uppyState.instances.at(-1)!;
    const [, opts] = uppy.use.mock.calls.find(
      ([name]) => name === 'TusPlugin',
    )!;
    const setHeader = vi.fn();
    await (opts as {
      onBeforeRequest: (r: { setHeader: (k: string, v: string) => void }) => Promise<void>;
    }).onBeforeRequest({ setHeader });
    expect(setHeader).toHaveBeenCalledWith(
      'Authorization',
      'Bearer lift-token',
    );

    // onError just logs — call it for coverage.
    const err = new Error('nope');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (opts as { onError: (e: Error) => void }).onError(err);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reuses existing Tus plugin via setOptions', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    const setOptions = vi.fn();
    // Prime an existing Tus plugin.
    uppy._plugins.set('Tus', { setOptions });
    uppy.getPlugin.mockImplementation((n: string) =>
      n === 'Tus' ? { setOptions } : undefined,
    );
    await engine.setup();
    expect(setOptions).toHaveBeenCalled();
  });
});

describe('AuraloaderEngine.processFile', () => {
  it('marks a file with no data as failed and removes it', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'x.dcm', meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out).toEqual({ outcome: 'failed', reason: 'File has no data' });
    expect(uppy.removeFile).toHaveBeenCalledWith('f1');
  });

  it('marks a file as failed when readDicom rejects', async () => {
    readDicomState.readDicom.mockRejectedValueOnce(new Error('io-error'));
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'x.dcm', data: new Blob(), meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out).toEqual({ outcome: 'failed', reason: 'io-error' });
  });

  it('falls back to "Could not read file" when the error lacks a message property', async () => {
    // Rejecting with a plain object (no .message) triggers the ?? fallback.
    readDicomState.readDicom.mockRejectedValueOnce({} as never);
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'x.dcm', data: new Blob(), meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out.outcome).toBe('failed');
    expect(out.reason).toBe('Could not read file');
  });

  it('skips DICOMDIR entries', async () => {
    parserState.parseDicom.mockReturnValueOnce(makeDataSet({}));
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({
      id: 'f1',
      name: 'DICOMDIR',
      data: new Blob(),
      meta: {},
    });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out).toEqual({ outcome: 'skipped', reason: 'DICOMDIR index' });
  });

  it('rejects when the file matches a reject rule', async () => {
    parserState.parseDicom.mockReturnValueOnce(
      makeDataSet({
        [dicomMap.sop_class_uid]: dicomRejects[0][dicomMap.sop_class_uid],
        [dicomMap.protocol_name]: dicomRejects[0][dicomMap.protocol_name],
      }),
    );
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'x.dcm', data: new Blob(), meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out).toEqual({
      outcome: 'rejected',
      reason: 'Filtered by DICOM rules',
    });
  });

  it('fails when the parser throws', async () => {
    parserState.parseDicom.mockImplementationOnce(() => {
      throw new Error('not dicom');
    });
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'x.dcm', data: new Blob(), meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out).toEqual({ outcome: 'failed', reason: 'not dicom' });
  });

  it('falls back to a generic reason when the parser throws without a message', async () => {
    parserState.parseDicom.mockImplementationOnce(() => {
      // Throwing a bare object exercises the ?? fallback.
      throw {} as never;
    });
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'x.dcm', data: new Blob(), meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out.reason).toBe('Not a readable DICOM file');
  });

  it('accepts a valid file, logs warnings, and populates meta + counts', async () => {
    parserState.parseDicom.mockReturnValueOnce(
      makeDataSet(
        {
          [dicomMap.study_uid]: 'STUDY-1',
          [dicomMap.series_uid]: 'SERIES-1',
          [dicomMap.patient_name]: 'DOE^JOHN',
          [dicomMap.modality]: 'CT',
          [dicomMap.study_description]: 'Chest',
        },
        ['odd tag'],
      ),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push({ id: 'f1', name: 'IM1', data: new Blob(), meta: {} });
    const out = await engine.processFile(uppy._files[0] as never);
    expect(out).toEqual({ outcome: 'accepted' });
    expect(uppy.setFileMeta).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({
        study_uid: 'STUDY-1',
        series_uid: 'SERIES-1',
        patient_name: 'DOE^JOHN',
        modality: 'CT',
        study_description: 'Chest',
      }),
    );
    expect(engine.studies).toEqual(['STUDY-1']);
    expect(engine.series).toEqual(['SERIES-1']);
    expect(engine.totalFiles).toBe(1);
    warnSpy.mockRestore();
  });

  it('listBuilder deduplicates, ignores null values, and appends new entries to a non-empty list', async () => {
    parserState.parseDicom
      .mockReturnValueOnce(
        makeDataSet({
          [dicomMap.study_uid]: 'STUDY-A',
          [dicomMap.series_uid]: 'SERIES-A',
        }),
      )
      .mockReturnValueOnce(
        // Same study, new series → hits the non-empty-list append branch.
        makeDataSet({
          [dicomMap.study_uid]: 'STUDY-A',
          [dicomMap.series_uid]: 'SERIES-B',
        }),
      )
      .mockReturnValueOnce(
        // Missing UIDs → null branch.
        makeDataSet({}),
      );
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    for (let i = 0; i < 3; i++) {
      uppy._files.push({
        id: `f${i}`,
        name: `IM${i}`,
        data: new Blob(),
        meta: {},
      });
      await engine.processFile(uppy._files[i] as never);
    }
    expect(engine.studies).toEqual(['STUDY-A']);
    expect(engine.series).toEqual(['SERIES-A', 'SERIES-B']);
  });
});

describe('AuraloaderEngine.process', () => {
  it('emits a preparing/summarising progress pair for an empty file list', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    const onProgress = vi.fn();
    await engine.process(onProgress);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      current: 0,
      total: 0,
      phase: 'preparing',
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      current: 0,
      total: 0,
      phase: 'summarising',
    });
  });

  it('yields to the event loop every 25 files', async () => {
    parserState.parseDicom.mockReturnValue(
      makeDataSet({
        [dicomMap.study_uid]: 'S',
        [dicomMap.series_uid]: 'R',
      }),
    );
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    for (let i = 0; i < 26; i++) {
      uppy._files.push({
        id: `f${i}`,
        name: `IM${i}`,
        data: new Blob(),
        meta: {},
      });
    }
    const timerSpy = vi.spyOn(globalThis, 'setTimeout');
    await engine.process(vi.fn());
    // One setTimeout at index 25.
    expect(timerSpy).toHaveBeenCalled();
    timerSpy.mockRestore();
  });

  it('aborts when cancelProcessing is set mid-loop', async () => {
    parserState.parseDicom.mockReturnValue(
      makeDataSet({
        [dicomMap.study_uid]: 'S',
        [dicomMap.series_uid]: 'R',
      }),
    );
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    for (let i = 0; i < 3; i++) {
      uppy._files.push({
        id: `f${i}`,
        name: `IM${i}`,
        data: new Blob(),
        meta: {},
      });
    }
    // process() resets cancelProcessing to false at the top; flip it during
    // the first file's readDicom to trigger the AbortError on the next iter.
    readDicomState.readDicom.mockImplementationOnce(async () => {
      engine.cancelProcessing = true;
      return new ArrayBuffer(4);
    });
    await expect(engine.process()).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('AuraloaderEngine — housekeeping & getters', () => {
  it('validFile returns true when nothing to reject and false otherwise', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    // Truthy match → false
    const bad = makeDataSet({
      [dicomMap.sop_class_uid]: dicomRejects[0][dicomMap.sop_class_uid],
      [dicomMap.protocol_name]: dicomRejects[0][dicomMap.protocol_name],
    });
    expect(await engine.validFile(bad as never)).toBe(false);

    const good = makeDataSet({});
    expect(await engine.validFile(good as never)).toBe(true);
  });

  it('removeStudy strips matching files and re-runs process', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push(
      { id: 'a', name: 'A', meta: { study_uid: 'S1' } },
      { id: 'b', name: 'B', meta: { study_uid: 'S2' } },
    );
    const processSpy = vi.spyOn(engine, 'process').mockResolvedValueOnce(undefined);
    await engine.removeStudy('S1');
    expect(uppy.removeFile).toHaveBeenCalledWith('a');
    expect(uppy.removeFile).not.toHaveBeenCalledWith('b');
    expect(processSpy).toHaveBeenCalled();
  });

  it('reset() cancels all uploads and clears counters', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    engine.studies.push('a');
    engine.series.push('b');
    engine.filesCount = 5;
    engine.cancelProcessing = true;
    await engine.reset();
    expect(uppy.cancelAll).toHaveBeenCalled();
    expect(engine.studies).toEqual([]);
    expect(engine.series).toEqual([]);
    expect(engine.filesCount).toBe(0);
    expect(engine.cancelProcessing).toBe(false);
  });

  it('exposes count getters and fileMeta', () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push(
      { id: '1', name: 'a', meta: { study_uid: 's1' } },
      { id: '2', name: 'b', meta: { study_uid: 's2' } },
    );
    engine.filesCount = 2;
    engine.studies.push('s1', 's2');
    engine.series.push('r1');
    expect(engine.totalFiles).toBe(2);
    expect(engine.studiesCount).toBe(2);
    expect(engine.seriesCount).toBe(1);
    expect(engine.fileMeta.map((m) => m.study_uid)).toEqual(['s1', 's2']);
  });

  it('studiesInfo aggregates by study and dedupes series/modalities', () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push(
      // Missing UIDs → skipped.
      { id: 'skip', name: 'x', meta: { study_uid: '', series_uid: '' } },
      {
        id: '1',
        name: 'a',
        meta: {
          study_uid: 'S1',
          series_uid: 'R1',
          study_description: '',
          modality: 'CT',
        },
      },
      {
        id: '2',
        name: 'b',
        meta: {
          study_uid: 'S1',
          series_uid: 'R1',
          study_description: 'Chest',
          modality: 'CT',
        },
      },
      {
        id: '3',
        name: 'c',
        meta: {
          study_uid: 'S1',
          series_uid: 'R2',
          modality: 'MR',
        },
      },
      {
        id: '4',
        name: 'd',
        meta: {
          study_uid: 'S1',
          series_uid: 'R3',
          // No modality → exercises the empty-modality branch.
        },
      },
    );
    const info = engine.studiesInfo;
    expect(Object.keys(info)).toEqual(['S1']);
    expect(info.S1.images).toBe(4);
    expect(info.S1.study_description).toBe('Chest');
    expect(info.S1.series_count).toBe(3);
    expect(info.S1.modalities.sort()).toEqual(['CT', 'MR']);
    expect(Object.keys(info.S1.series).sort()).toEqual(['R1', 'R2', 'R3']);
  });

  it('zipFiles adds every file into the archive and pushes the archive back', async () => {
    const engine = new AuraloaderEngine(makeConfig());
    const uppy = uppyState.instances.at(-1)!;
    uppy._files.push(
      {
        id: '1',
        name: 'a.dcm',
        data: new Blob([new Uint8Array([1])]),
        meta: { study_uid: 'S1' },
      },
      {
        id: '2',
        name: 'nested/b.dcm',
        data: new Blob([new Uint8Array([2])]),
        meta: { study_uid: 'S1', relativePath: 'sub/dir/b.dcm' },
      },
    );
    await engine.zipFiles();
    expect(zipState.added.map((e) => e.name)).toEqual([
      'S1/a.dcm',
      'S1/sub-dir-b.dcm',
    ]);
    // Original files removed, zip added.
    expect(uppy.removeFile).toHaveBeenCalledWith('1');
    expect(uppy.removeFile).toHaveBeenCalledWith('2');
    expect(uppy.addFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/\.zip$/),
        type: 'application/zip',
        source: 'local',
      }),
    );
  });
});
