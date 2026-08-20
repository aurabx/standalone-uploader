import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Renderer } from '../../ui/Renderer';
import { Store } from '../../ui/Store';
import type { StudyInfo, UploaderState } from '../../types';

function makeStudy(overrides: Partial<StudyInfo> = {}): StudyInfo {
  return {
    study_uid: 'study-1',
    patient_name: 'DOE^JOHN^M',
    patient_id: 'p1',
    study_date: '20240115',
    study_time: '120000',
    study_description: 'Chest',
    institution_name: 'Hospital',
    modalities: ['CT', 'MR'],
    series_count: 2,
    images: 3,
    ...overrides,
  };
}

function seedStart(store: Store, patch: Partial<UploaderState>): void {
  // Bypass private setState via applyProcessingProgress + explicit setters.
  if ('step' in patch && patch.step) store.goto(patch.step);
  if ('errorMessage' in patch && typeof patch.errorMessage === 'string') {
    if (patch.step === 'error') {
      store.setError(patch.errorMessage);
    }
  }
  if ('connectionIssues' in patch)
    store.setConnectionIssues(!!patch.connectionIssues);
  if ('zipping' in patch) store.setZipping(!!patch.zipping);
  if ('complete' in patch) store.setComplete(!!patch.complete);
  if ('totalFiles' in patch || 'studies' in patch) {
    store.setSummary({
      totalFiles: patch.totalFiles ?? 0,
      studiesCount: patch.studies?.length ?? 0,
      seriesCount: 0,
      studies: (patch.studies ?? []).reduce<Record<string, StudyInfo>>(
        (acc, s) => {
          acc[s.study_uid] = s;
          return acc;
        },
        {},
      ),
    });
  }
}

describe('Renderer', () => {
  let container: HTMLElement;
  let store: Store;

  beforeEach(() => {
    document.body.innerHTML = '';
    // Ensure clean style injection between tests.
    document.getElementById('standalone-auraloader-styles')?.remove();
    container = document.createElement('div');
    container.id = 'uploader';
    document.body.appendChild(container);
    store = new Store();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('throws when the container id is missing', () => {
    expect(() => new Renderer('does-not-exist', store)).toThrow(
      'Container element with id "does-not-exist" not found',
    );
  });

  it('mount injects styles exactly once even across renderers', () => {
    const r1 = new Renderer('uploader', store);
    r1.mount();
    const styleCount1 = document.head.querySelectorAll(
      '#standalone-auraloader-styles',
    ).length;
    expect(styleCount1).toBe(1);

    // Second container + renderer
    const other = document.createElement('div');
    other.id = 'other';
    document.body.appendChild(other);
    const r2 = new Renderer('other', store);
    r2.mount();
    const styleCount2 = document.head.querySelectorAll(
      '#standalone-auraloader-styles',
    ).length;
    expect(styleCount2).toBe(1);
  });

  it('unmount clears the container and stops rendering on state changes', () => {
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.innerHTML).not.toBe('');
    r.unmount();
    expect(container.innerHTML).toBe('');
    store.goto('processing');
    expect(container.innerHTML).toBe('');
    // A second unmount is a no-op.
    r.unmount();
  });

  it('renders the start step with a drag-drop target', () => {
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.querySelector('#sal-drag-drop-area')).not.toBeNull();
    expect(container.textContent).toContain('Upload');
  });

  it('renders the connection warning when flagged', () => {
    store.setConnectionIssues(true);
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.querySelector('.sal-warning')).not.toBeNull();
    expect(container.textContent).toContain('Connection issues detected');
  });

  it('renders the error step with an escaped message', () => {
    const r = new Renderer('uploader', store);
    r.mount();
    store.setError('<script>alert(1)</script>');
    const msg = container.querySelector('.sal-error-message')!;
    expect(msg.textContent).toBe('<script>alert(1)</script>');
    expect(msg.innerHTML).toContain('&lt;script&gt;');
  });

  it('renders the processing step with counter, tally, stalled banner and error toggle', () => {
    const r = new Renderer('uploader', store);
    r.mount();
    store.goto('processing');
    for (let i = 0; i < 3; i++) {
      store.applyProcessingProgress({
        current: i + 1,
        total: 4,
        phase: 'reading',
        outcome: i === 0 ? 'accepted' : 'failed',
        fileName: `IM${i}`,
        reason: 'not dicom',
      });
    }
    store.markProcessingStalled(true);
    // Verify all the branches render.
    expect(container.querySelector('.sal-processing-counter')?.textContent)
      .toContain('/');
    expect(container.querySelector('.sal-processing-tally')).not.toBeNull();
    expect(container.querySelector('.sal-processing-stalled')).not.toBeNull();
    const toggle = container.querySelector(
      '#sal-toggle-processing-errors',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent).toContain('Show skipped files');

    // Flip via the store — the toggle text should change and the list appears.
    store.toggleProcessingErrors();
    expect(container.querySelector('.sal-processing-errors-list')).not.toBeNull();
    expect(
      container.querySelector('#sal-toggle-processing-errors')!.textContent,
    ).toContain('Hide skipped files');
  });

  it('renders processing when nothing has been reported yet (no counter/tally)', () => {
    const r = new Renderer('uploader', store);
    r.mount();
    store.goto('processing');
    expect(container.querySelector('.sal-processing-counter')).toBeNull();
    expect(container.querySelector('.sal-processing-tally')).toBeNull();
  });

  it('renders the pending step: empty state when no files', () => {
    seedStart(store, { step: 'pending', totalFiles: 0, studies: [] });
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.textContent).toContain('No valid DICOM images found');
  });

  it('renders study cards and dispatches sal:removeStudy on Skip', () => {
    seedStart(store, {
      step: 'pending',
      totalFiles: 3,
      studies: [makeStudy(), makeStudy({ study_uid: 'study-2', images: 1 })],
    });
    const r = new Renderer('uploader', store);
    r.mount();
    const cards = container.querySelectorAll('.sal-study-card');
    expect(cards).toHaveLength(2);
    // pluralisation branch: 1 image → "image" (no 's'), 3 → "images"
    expect(container.textContent).toMatch(/3 images over 2 series/);
    expect(container.textContent).toMatch(/1 image over 2 series/);

    const dispatched = vi.fn();
    container.addEventListener('sal:removeStudy', dispatched);
    const btn = container.querySelector(
      '.sal-remove-study[data-study-uid="study-2"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(dispatched).toHaveBeenCalled();
    expect((dispatched.mock.calls[0][0] as CustomEvent).detail).toEqual({
      uid: 'study-2',
    });
  });

  it('renders pending study card fallbacks when metadata is sparse', () => {
    seedStart(store, {
      step: 'pending',
      totalFiles: 1,
      studies: [
        makeStudy({
          patient_name: '',
          study_description: '',
          institution_name: '',
          modalities: [],
        }),
      ],
    });
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.textContent).toContain('Unknown Patient');
    expect(container.textContent).toContain('No description');
    expect(container.textContent).toContain('Unknown institution');
  });

  it('renders the uploading step: zipping branch', () => {
    store.goto('uploading');
    store.setZipping(true);
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.textContent).toContain('Preparing files for upload');
    expect(container.querySelector('.sal-loader')).not.toBeNull();
  });

  it('renders the uploading step: in-progress branch with progress area', () => {
    seedStart(store, { step: 'uploading', totalFiles: 2 });
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.querySelector('#sal-progress-area')).not.toBeNull();
    expect(container.textContent).toContain('Uploading 2 images');
  });

  it('renders the uploading step: complete branch with singular pluralisation', () => {
    seedStart(store, { step: 'uploading', totalFiles: 1, complete: true });
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.querySelector('.sal-success')).not.toBeNull();
    expect(container.textContent).toContain(
      'Successfully uploaded 1 image to Aurabox',
    );
    const addMore = container.querySelector(
      '#sal-add-more-btn',
    ) as HTMLButtonElement;
    expect(addMore).not.toBeNull();
    const heard = vi.fn();
    container.addEventListener('sal:reset', heard);
    addMore.click();
    expect(heard).toHaveBeenCalled();
  });

  it('renders the complete step with the Add-more link', () => {
    store.goto('complete');
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.querySelector('.sal-complete-section')).not.toBeNull();
    const heard = vi.fn();
    container.addEventListener('sal:reset', heard);
    (container.querySelector('.sal-add-more') as HTMLButtonElement).click();
    expect(heard).toHaveBeenCalled();
  });

  it('renders the cancelled step', () => {
    store.goto('cancelled');
    const r = new Renderer('uploader', store);
    r.mount();
    expect(container.textContent).toContain('Upload cancelled');
  });

  it('start-step Cancel button fires sal:cancel', () => {
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:cancel', spy);
    (container.querySelector('#sal-cancel-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('pending-step Upload button fires sal:upload', () => {
    seedStart(store, {
      step: 'pending',
      totalFiles: 1,
      studies: [makeStudy()],
    });
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:upload', spy);
    (container.querySelector('#sal-upload-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('pending-step Try Again (0 files) fires sal:reset', () => {
    seedStart(store, { step: 'pending', totalFiles: 0, studies: [] });
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:reset', spy);
    (container.querySelector('#sal-reset-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('uploading Cancel-Upload button fires sal:cancelUpload', () => {
    store.goto('uploading');
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:cancelUpload', spy);
    (container.querySelector(
      '#sal-cancel-upload-btn',
    ) as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('processing Cancel button fires sal:cancelProcessing', () => {
    store.goto('processing');
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:cancelProcessing', spy);
    (container.querySelector(
      '#sal-cancel-processing-btn',
    ) as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('processing errors toggle button fires sal:toggleProcessingErrors', () => {
    store.goto('processing');
    store.applyProcessingProgress({
      current: 1,
      total: 1,
      phase: 'reading',
      outcome: 'failed',
      fileName: 'x',
      reason: 'y',
    });
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:toggleProcessingErrors', spy);
    (container.querySelector(
      '#sal-toggle-processing-errors',
    ) as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('complete-step Done button fires sal:done', () => {
    store.goto('complete');
    const r = new Renderer('uploader', store);
    r.mount();
    const spy = vi.fn();
    container.addEventListener('sal:done', spy);
    (container.querySelector('#sal-done-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('renders nothing when no buttons apply', () => {
    store.goto('processing');
    const r = new Renderer('uploader', store);
    r.mount();
    // Processing still has the Cancel button, so there IS a .sal-buttons; verify uploading + zipping+complete case which has none of the button branches.
    store.setZipping(true);
    store.setComplete(true);
    store.goto('uploading');
    expect(container.querySelector('.sal-buttons')).toBeNull();
  });

  it('onRender callback runs on each render', () => {
    const r = new Renderer('uploader', store);
    const cb = vi.fn();
    r.onRender(cb);
    r.mount();
    store.goto('processing');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('exposes target selectors', () => {
    const r = new Renderer('uploader', store);
    expect(r.getDragDropTarget()).toBe('#sal-drag-drop-area');
    expect(r.getProgressTarget()).toBe('#sal-progress-area');
  });
});
