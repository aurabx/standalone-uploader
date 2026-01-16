import type { UploaderState, UploaderStep, StudyInfo, AuraloaderCallbacks } from '../types';
import { formatName, formatDate, formatModalities } from '../core/dicom';

export type StateListener = (state: UploaderState) => void;

/**
 * Internal state store for the uploader.
 * Manages state and notifies listeners on changes.
 */
export class Store {
  private state: UploaderState;
  private listeners: Set<StateListener> = new Set();
  private callbacks: AuraloaderCallbacks;

  constructor(callbacks: AuraloaderCallbacks = {}) {
    this.callbacks = callbacks;
    this.state = this.getInitialState();
  }

  private getInitialState(): UploaderState {
    return {
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
    };
  }

  /**
   * Get current state
   */
  getState(): UploaderState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
    this.callbacks.onStateChange?.(state);
  }

  /**
   * Update state
   */
  private setState(updates: Partial<UploaderState>): void {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  /**
   * Go to a specific step
   */
  goto(step: UploaderStep): void {
    this.setState({ step });
  }

  /**
   * Set error message and go to error step
   */
  setError(message: string): void {
    this.setState({ 
      step: 'error', 
      errorMessage: message 
    });
    this.callbacks.onUploadError?.({ context: 'upload', message });
  }

  /**
   * Set complete status
   */
  setComplete(complete: boolean): void {
    this.setState({ complete });
  }

  /**
   * Set zipping status
   */
  setZipping(zipping: boolean): void {
    this.setState({ zipping });
  }

  /**
   * Set study ID
   */
  setStudyId(studyId: string): void {
    this.setState({ studyId });
  }

  /**
   * Set studies from API response
   */
  setStudiesFromApi(studies: Array<{ id: string }>): void {
    // This is for API response studies, different from DICOM studies
    if (studies.length > 0) {
      this.setState({ studyId: studies[studies.length - 1].id });
    }
  }

  /**
   * Update summary from processed files
   */
  setSummary(data: {
    totalFiles: number;
    studiesCount: number;
    seriesCount: number;
    studies: Record<string, StudyInfo>;
  }): void {
    const studiesList = Object.values(data.studies);
    this.setState({
      totalFiles: data.totalFiles,
      studiesCount: data.studiesCount,
      seriesCount: data.seriesCount,
      studies: studiesList,
    });
    this.callbacks.onStudiesFound?.(studiesList);
  }

  /**
   * Set connection issues flag
   */
  setConnectionIssues(hasIssues: boolean): void {
    this.setState({ connectionIssues: hasIssues });
  }

  /**
   * Reset state to initial
   */
  reset(): void {
    this.state = this.getInitialState();
    this.notify();
  }

  // Helper methods for UI formatting
  formatName(name: string): string {
    return formatName(name);
  }

  formatDate(date: string): string {
    return formatDate(date);
  }

  formatModalities(study: StudyInfo): string {
    // Convert StudyInfo to the format expected by formatModalities
    const studyWithSeries = {
      series: {} as Record<string, { modality: string }>,
    };
    
    // Build series from modalities array
    if (study.modalities) {
      study.modalities.forEach((mod, idx) => {
        studyWithSeries.series[`series-${idx}`] = { modality: mod };
      });
    }
    
    return formatModalities(studyWithSeries);
  }
}
