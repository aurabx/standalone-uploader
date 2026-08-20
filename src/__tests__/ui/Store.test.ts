import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Store } from '../../ui/Store';
import type {
  AuraloaderCallbacks,
  ProcessProgress,
  StudyInfo,
} from '../../types';

function makeCallbacks(): Required<AuraloaderCallbacks> {
  return {
    onUploadComplete: vi.fn(),
    onUploadError: vi.fn(),
    onUploadCancel: vi.fn(),
    onStudiesFound: vi.fn(),
    onStateChange: vi.fn(),
  };
}

function makeStudy(overrides: Partial<StudyInfo> = {}): StudyInfo {
  return {
    study_uid: 'study-1',
    patient_name: 'DOE^JOHN',
    patient_id: 'p1',
    study_date: '20240115',
    study_time: '120000',
    study_description: 'Chest',
    institution_name: 'Hospital',
    modalities: ['CT'],
    series_count: 1,
    images: 3,
    ...overrides,
  };
}

describe('Store', () => {
  let store: Store;
  let callbacks: Required<AuraloaderCallbacks>;

  beforeEach(() => {
    callbacks = makeCallbacks();
    store = new Store(callbacks);
  });

  it('accepts construction without callbacks', () => {
    const bare = new Store();
    expect(bare.getState().step).toBe('start');
  });

  it('starts in the initial state', () => {
    const state = store.getState();
    expect(state).toMatchObject({
      step: 'start',
      totalFiles: 0,
      studiesCount: 0,
      seriesCount: 0,
      studies: [],
      complete: false,
      studyId: '',
      zipping: false,
      errorMessage: '',
      connectionIssues: false,
      processingPhase: 'preparing',
      processingCurrent: 0,
      processingTotal: 0,
      processingAccepted: 0,
      processingSkipped: 0,
      processingRejected: 0,
      processingFailed: 0,
      processingStalled: false,
      processingErrors: [],
      processingErrorsShown: false,
    });
  });

  it('getState returns a shallow copy', () => {
    const a = store.getState();
    const b = store.getState();
    expect(a).not.toBe(b);
    a.step = 'error';
    expect(store.getState().step).toBe('start');
  });

  it('subscribe fires on every setState and unsubscribes cleanly', () => {
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.goto('processing');
    store.goto('pending');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.goto('uploading');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(callbacks.onStateChange).toHaveBeenCalledTimes(3);
  });

  it('setError transitions to error, stores message, and calls onUploadError', () => {
    store.setError('nope');
    expect(store.getState().step).toBe('error');
    expect(store.getState().errorMessage).toBe('nope');
    expect(callbacks.onUploadError).toHaveBeenCalledWith({
      context: 'upload',
      message: 'nope',
    });
  });

  it('setComplete / setZipping / setStudyId / setConnectionIssues', () => {
    store.setComplete(true);
    store.setZipping(true);
    store.setStudyId('study-42');
    store.setConnectionIssues(true);
    const state = store.getState();
    expect(state.complete).toBe(true);
    expect(state.zipping).toBe(true);
    expect(state.studyId).toBe('study-42');
    expect(state.connectionIssues).toBe(true);
  });

  it('setStudiesFromApi picks the last id and ignores an empty payload', () => {
    store.setStudiesFromApi([]);
    expect(store.getState().studyId).toBe('');
    store.setStudiesFromApi([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(store.getState().studyId).toBe('c');
  });

  it('setSummary populates counts and fires onStudiesFound', () => {
    store.setSummary({
      totalFiles: 5,
      studiesCount: 1,
      seriesCount: 2,
      studies: { s1: makeStudy() },
    });
    const state = store.getState();
    expect(state.totalFiles).toBe(5);
    expect(state.studiesCount).toBe(1);
    expect(state.seriesCount).toBe(2);
    expect(state.studies).toHaveLength(1);
    expect(callbacks.onStudiesFound).toHaveBeenCalledWith(state.studies);
  });

  it('resetProcessing wipes only the processing sub-state', () => {
    store.setStudyId('keep');
    store.applyProcessingProgress({
      current: 3,
      total: 10,
      phase: 'reading',
      outcome: 'accepted',
    });
    store.resetProcessing();
    const state = store.getState();
    expect(state.processingCurrent).toBe(0);
    expect(state.processingAccepted).toBe(0);
    expect(state.processingPhase).toBe('preparing');
    expect(state.studyId).toBe('keep');
  });

  it('applyProcessingProgress increments each outcome bucket', () => {
    const base: ProcessProgress = { current: 1, total: 4, phase: 'reading' };
    store.applyProcessingProgress({ ...base, outcome: 'accepted' });
    store.applyProcessingProgress({ ...base, current: 2, outcome: 'skipped' });
    store.applyProcessingProgress({ ...base, current: 3, outcome: 'rejected' });
    store.applyProcessingProgress({
      ...base,
      current: 4,
      outcome: 'failed',
      fileName: 'IM1',
      reason: 'not dicom',
    });
    const state = store.getState();
    expect(state.processingAccepted).toBe(1);
    expect(state.processingSkipped).toBe(1);
    expect(state.processingRejected).toBe(1);
    expect(state.processingFailed).toBe(1);
    expect(state.processingErrors).toEqual([
      { file: 'IM1', reason: 'not dicom' },
    ]);
  });

  it('applyProcessingProgress caps the error list at ten entries', () => {
    for (let i = 0; i < 15; i++) {
      store.applyProcessingProgress({
        current: i + 1,
        total: 15,
        phase: 'reading',
        outcome: 'failed',
        fileName: `IM${i}`,
        reason: 'boom',
      });
    }
    expect(store.getState().processingErrors).toHaveLength(10);
  });

  it('applyProcessingProgress defaults reason and skips push without a filename', () => {
    store.applyProcessingProgress({
      current: 1,
      total: 2,
      phase: 'reading',
      outcome: 'failed',
      fileName: 'X',
      // no reason
    });
    store.applyProcessingProgress({
      current: 2,
      total: 2,
      phase: 'reading',
      outcome: 'failed',
      // no fileName -> skipped
    });
    const errs = store.getState().processingErrors;
    expect(errs).toEqual([{ file: 'X', reason: 'Could not read file' }]);
  });

  it('markProcessingStalled toggles the stalled flag with a default of true', () => {
    store.markProcessingStalled();
    expect(store.getState().processingStalled).toBe(true);
    store.markProcessingStalled(false);
    expect(store.getState().processingStalled).toBe(false);
  });

  it('toggleProcessingErrors flips the shown flag', () => {
    expect(store.getState().processingErrorsShown).toBe(false);
    store.toggleProcessingErrors();
    expect(store.getState().processingErrorsShown).toBe(true);
    store.toggleProcessingErrors();
    expect(store.getState().processingErrorsShown).toBe(false);
  });

  it('reset restores the initial state and notifies', () => {
    store.setStudyId('x');
    store.goto('processing');
    callbacks.onStateChange.mockClear();
    store.reset();
    expect(store.getState().step).toBe('start');
    expect(store.getState().studyId).toBe('');
    expect(callbacks.onStateChange).toHaveBeenCalledTimes(1);
  });

  it('formatting helpers delegate to the shared dicom formatters', () => {
    expect(store.formatName('DOE^JOHN^M')).toBe('M JOHN DOE');
    expect(store.formatDate('20240115')).toContain('2024');
    expect(store.formatModalities(makeStudy({ modalities: ['CT', 'MR', 'CT'] })))
      .toBe('CT, MR');
    expect(store.formatModalities(makeStudy({ modalities: [] }))).toBe('');
    // Study missing modalities altogether — the helper builds an empty series map.
    expect(store.formatModalities(makeStudy({ modalities: undefined as unknown as string[] }))).toBe('');
  });
});
