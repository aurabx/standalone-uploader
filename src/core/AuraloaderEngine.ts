import { Uppy, Meta, UppyFile, Body } from '@uppy/core';
import { v4 as uuidv4 } from 'uuid';
import dicomParser, { DataSet } from 'dicom-parser';
import * as zip from '@zip.js/zip.js';
import DragDrop from '@uppy/drag-drop';
import StatusBar from '@uppy/status-bar';
import Tus from '@uppy/tus';

import {
  dicomGetValue,
  dicomShouldReject,
  readDicom,
  dicomMap,
  dicomRejects,
} from './dicom';
import type {
  StudyInfo,
  UploaderConfigResponse,
  ProcessProgress,
  ProcessOutcome,
} from '../types';

// Uppy CSS - bundled into the JS output
import '../styles.css';

export interface EngineConfig {
  dragDrop: {
    target: string;
    width?: string;
    height?: string;
    locale?: {
      strings?: {
        dropHereOr?: string;
        browse?: string;
      };
    };
  };
  statusBar: {
    target: string;
    hideUploadButton?: boolean;
    hideAfterFinish?: boolean;
    showProgressDetails?: boolean;
  };
  lift: {
    endpoint: string;
    token: string;
    bucket: string;
  };
  mode: string;
}

interface FileMeta extends Meta {
  study_uid?: string;
  series_uid?: string;
  patient_name?: string;
  patient_id?: string;
  study_date?: string;
  study_time?: string;
  study_description?: string;
  series_description?: string;
  institution_name?: string;
  institution_address?: string;
  other_patient_ids?: string | string[];
  accession_no?: string;
  issuer_of_patient_id?: string;
  patient_birth_date?: string;
  patient_sex?: string;
  referring_physician_name?: string;
  tz_offset?: string;
  modality?: string;
  body_part?: string;
  series_date?: string;
  series_time?: string;
  series_number?: string;
  relativePath?: string;
}

/**
 * Core upload engine handling file processing, DICOM parsing, and Tus uploads.
 * Adapted from aura AuraloaderEngine, simplified for standalone use.
 */
export class AuraloaderEngine {
  uppy: Uppy<FileMeta, Body>;
  studies: string[] = [];
  series: string[] = [];
  filesCount = 0;
  uniqueId = '';
  config: EngineConfig;
  connectionIssues = false;
  cancelProcessing = false;

  constructor(config: EngineConfig) {
    this.uniqueId = uuidv4();
    this.config = config;

    this.uppy = new Uppy<FileMeta, Body>({
      autoProceed: false,
      allowMultipleUploadBatches: false,
      locale: {
        strings: {
          uploadXFiles: {
            '0': 'Process %{smart_count} file',
            '1': 'Process %{smart_count} files',
          },
          uploadXNewFiles: {
            '0': 'Process %{smart_count} file',
            '1': 'Process %{smart_count} files',
          },
        },
        /* v8 ignore start -- invoked internally by Uppy locale machinery */
        pluralize(n: number) {
          return n === 1 ? 0 : 1;
        },
        /* v8 ignore stop */
      },
      meta: {
        upload_id: this.uniqueId,
      },
    });

    this.initializePlugins();
  }

  /**
   * Initialize Uppy plugins
   */
  private initializePlugins(): void {
    this.mountDragDrop();
    this.mountStatusBar();
  }

  /**
   * Mount or remount DragDrop plugin to target element
   */
  mountDragDrop(): void {
    const dragDropElement = document.querySelector(this.config.dragDrop.target);

    if (dragDropElement) {
      // Remove existing DragDrop plugin if present
      const existingPlugin = this.uppy.getPlugin('DragDrop');
      if (existingPlugin) {
        this.uppy.removePlugin(existingPlugin);
      }

      this.uppy.use(DragDrop, {
        target: this.config.dragDrop.target,
        width: this.config.dragDrop.width || '100%',
        height: this.config.dragDrop.height || '100%',
        locale: {
          strings: {
            dropHereOr: this.config.dragDrop.locale?.strings?.dropHereOr || 'Drag and drop files and folders here or %{browse}',
            browse: this.config.dragDrop.locale?.strings?.browse || 'browse',
          },
        },
      });
    }
  }

  /**
   * Mount or remount StatusBar plugin to target element
   */
  mountStatusBar(): void {
    if (document.querySelector(this.config.statusBar.target)) {
      // Remove existing StatusBar plugin if present
      const existingPlugin = this.uppy.getPlugin('StatusBar');
      if (existingPlugin) {
        this.uppy.removePlugin(existingPlugin);
      }

      this.uppy.use(StatusBar, {
        target: this.config.statusBar.target,
        hideUploadButton: this.config.statusBar.hideUploadButton ?? true,
        hideAfterFinish: this.config.statusBar.hideAfterFinish ?? false,
        showProgressDetails: this.config.statusBar.showProgressDetails ?? true,
      });
    }
  }

  /**
   * Setup Tus upload configuration
   */
  async setup(): Promise<void> {
    this.uniqueId = uuidv4();
    
    // Estimate connection speed for upload limits
    const connection = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
    const limit = connection?.downlink && connection.downlink > 5 ? 50 : 10;

    const tusOptions = {
      endpoint: this.config.lift.endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      allowedMetaFields: true as const,
      removeFingerprintOnSuccess: true,
      limit: limit,
      chunkSize: 1024 * 1024 * 5, // 5MB chunks
      overridePatchMethod: false,
      onBeforeRequest: async (req: { setHeader: (key: string, value: string) => void }) => {
        req.setHeader('Authorization', `Bearer ${this.config.lift.token}`);
      },
      onError: (error: Error) => {
        console.error('Tus upload failed:', error);
      },
    };

    this.uppy.setMeta({
      upload_id: this.uniqueId,
      bucket: this.config.lift.bucket,
      mode: this.config.mode,
    });

    if (this.uppy.getPlugin('Tus')) {
      const plugin = this.uppy.getPlugin('Tus');
      plugin?.setOptions(tusOptions);
    } else {
      this.uppy.use(Tus, tusOptions);
    }
  }

  /**
   * Iterate every file that Uppy is holding, extract DICOM metadata, and
   * emit per-file progress via onProgress. The loop yields to the browser
   * every YIELD_EVERY files so the UI can repaint the progress bar and the
   * user can hit Cancel.
   */
  async process(onProgress?: (progress: ProcessProgress) => void): Promise<void> {
    this.cancelProcessing = false;

    const files = this.uppy.getFiles();
    const total = files.length;
    const YIELD_EVERY = 25;

    onProgress?.({ current: 0, total, phase: 'preparing' });

    let index = 0;
    for await (const file of files) {
      if (this.cancelProcessing) {
        throw new DOMException('Processing cancelled by user', 'AbortError');
      }

      const result = await this.processFile(file);
      index += 1;

      onProgress?.({
        current: index,
        total,
        phase: 'reading',
        outcome: result.outcome,
        fileName: file.name,
        reason: result.reason,
      });

      if (index % YIELD_EVERY === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    onProgress?.({ current: total, total, phase: 'summarising' });
  }

  /**
   * Process a single file and return the outcome so the caller can
   * aggregate a tally.
   */
  async processFile(
    file: UppyFile<FileMeta, Body>
  ): Promise<{ outcome: ProcessOutcome; reason?: string }> {
    if (!file.data) {
      this.uppy.removeFile(file.id);
      return { outcome: 'failed', reason: 'File has no data' };
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await readDicom(file.data as Blob);
    } catch (err) {
      this.uppy.removeFile(file.id);
      return {
        outcome: 'failed',
        reason: (err as Error)?.message ?? 'Could not read file',
      };
    }

    let dataSet: DataSet;
    try {
      const byteArray = new Uint8Array(arrayBuffer);
      // Stop at the PixelData tag: metadata lives before it, and the
      // buffer may be a truncated header slice for very large files.
      dataSet = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' });

      // Skip DICOMDIR files
      if (file?.name === 'DICOMDIR') {
        this.uppy.removeFile(file.id);
        return { outcome: 'skipped', reason: 'DICOMDIR index' };
      }

      // Validate file
      if (!(await this.validFile(dataSet))) {
        this.uppy.removeFile(file.id);
        return { outcome: 'rejected', reason: 'Filtered by DICOM rules' };
      }

      // Log warnings
      if (dataSet.warnings.length > 0) {
        dataSet.warnings.forEach((warning) => {
          console.warn('DICOM warning:', warning);
        });
      }
    } catch (err) {
      console.debug('Failed to parse file as DICOM:', file.name);
      this.uppy.removeFile(file.id);
      return {
        outcome: 'failed',
        reason: (err as Error)?.message ?? 'Not a readable DICOM file',
      };
    }

    await this.formatFile(file, dataSet);
    return { outcome: 'accepted' };
  }

  /**
   * Extract and set DICOM metadata on a file
   */
  async formatFile(file: UppyFile<FileMeta, Body>, dataSet: DataSet): Promise<void> {
    const study_uid = dicomGetValue(dataSet, dicomMap.study_uid) as string;
    const series_uid = dicomGetValue(dataSet, dicomMap.series_uid) as string;
    const patient_name = dicomGetValue(dataSet, dicomMap.patient_name) as string;

    this.uppy.setFileMeta(file.id, {
      study_uid,
      study_description: dicomGetValue(dataSet, dicomMap.study_description) as string,
      institution_name: dicomGetValue(dataSet, dicomMap.institution_name) as string,
      institution_address: dicomGetValue(dataSet, dicomMap.institution_address) as string,
      patient_id: dicomGetValue(dataSet, dicomMap.patient_id) as string,
      other_patient_ids: dicomGetValue(dataSet, dicomMap.other_patient_ids) as string | string[],
      accession_no: dicomGetValue(dataSet, dicomMap.accession_no) as string,
      patient_name,
      issuer_of_patient_id: dicomGetValue(dataSet, dicomMap.issuer_of_patient_id) as string,
      patient_birth_date: dicomGetValue(dataSet, dicomMap.patient_birth_date) as string,
      patient_sex: dicomGetValue(dataSet, dicomMap.patient_sex) as string,
      referring_physician_name: dicomGetValue(dataSet, dicomMap.referring_physician_name) as string,
      study_date: dicomGetValue(dataSet, dicomMap.study_date) as string,
      study_time: dicomGetValue(dataSet, dicomMap.study_time) as string,
      tz_offset: dicomGetValue(dataSet, dicomMap.tz_offset) as string,
      series_uid,
      modality: dicomGetValue(dataSet, dicomMap.modality) as string,
      series_description: dicomGetValue(dataSet, dicomMap.series_description) as string,
      body_part: dicomGetValue(dataSet, dicomMap.body_part) as string,
      series_date: dicomGetValue(dataSet, dicomMap.series_date) as string,
      series_time: dicomGetValue(dataSet, dicomMap.series_time) as string,
      series_number: dicomGetValue(dataSet, dicomMap.series_number) as string,
    });

    this.listBuilder(this.studies, study_uid);
    this.listBuilder(this.series, series_uid);
    this.filesCount = this.uppy.getFiles().length;
  }

  /**
   * Validate a DICOM file against rejection rules
   */
  async validFile(dataSet: DataSet): Promise<boolean> {
    /* v8 ignore next -- guard against an empty rules table; the shipped table always has entries */
    if (dicomRejects.length > 0) {
      for (const dicomReject of dicomRejects) {
        const badFile = await dicomShouldReject(dicomReject, dataSet);
        if (badFile) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Remove all files belonging to a study
   */
  async removeStudy(uid: string): Promise<void> {
    this.uppy.getFiles().forEach((file) => {
      if (file.meta.study_uid === uid) {
        this.uppy.removeFile(file.id);
      }
    });

    await this.resetCounts();
    await this.process();
  }

  /**
   * Helper to build unique lists
   */
  private listBuilder(
    list: string[],
    fileParam: string | number | string[] | null | undefined
  ): void {
    if (fileParam === null || fileParam === undefined) {
      return;
    }

    const value = fileParam.toString();

    if (list.length >= 1) {
      const itemExist = list.find((item) => item === value);
      if (itemExist === undefined) {
        list.push(value);
      }
    } else {
      list.push(value);
    }
  }

  /**
   * Reset file counts
   */
  async resetCounts(): Promise<void> {
    this.series = [];
    this.studies = [];
    this.filesCount = 0;
  }

  /**
   * Reset the engine
   */
  async reset(): Promise<void> {
    this.cancelProcessing = false;
    this.uppy.cancelAll();
    await this.resetCounts();
  }

  /**
   * Zip all files for upload
   */
  async zipFiles(): Promise<void> {
    const blobWriter = new zip.BlobWriter('application/zip');
    const writer = new zip.ZipWriter(blobWriter);

    for await (const file of this.uppy.getFiles()) {
      let name = file.meta.relativePath
        ? (file.meta.relativePath as string)
        : file.name;

      name = (name as string).replaceAll('/', '-');
      name = file.meta?.study_uid + '/' + name;

      const fileBlob = new zip.BlobReader(file.data as Blob);
      await writer.add(name, fileBlob);
      await this.uppy.removeFile(file.id);
    }

    await writer.close();

    const blob = await blobWriter.getData();

    this.uppy.addFile({
      name: `${this.uniqueId}.zip`,
      type: 'application/zip',
      data: blob,
      source: 'local',
    });
  }

  /**
   * Get total file count
   */
  get totalFiles(): number {
    return this.filesCount;
  }

  /**
   * Get series count
   */
  get seriesCount(): number {
    return this.series.length;
  }

  /**
   * Get studies count
   */
  get studiesCount(): number {
    return this.studies.length;
  }

  /**
   * Get file metadata
   */
  get fileMeta(): FileMeta[] {
    return this.uppy.getFiles().map((file) => file.meta);
  }

  /**
   * Get aggregated study information
   */
  get studiesInfo(): Record<string, StudyInfo & { series: Record<string, unknown> }> {
    const items = this.fileMeta;
    const build: Record<string, StudyInfo & { series: Record<string, unknown> }> = {};

    for (const item of items) {
      const studyUid = item.study_uid as string;
      const seriesUid = item.series_uid as string;

      // Skip items without valid study or series UIDs
      if (!studyUid || !seriesUid) {
        continue;
      }

      if (!(studyUid in build)) {
        build[studyUid] = {
          study_uid: studyUid,
          study_description: (item.study_description as string) || '',
          institution_name: (item.institution_name as string) || '',
          patient_id: (item.patient_id as string) || '',
          patient_name: (item.patient_name as string) || '',
          study_date: (item.study_date as string) || '',
          study_time: (item.study_time as string) || '',
          modalities: [],
          series: {},
          images: 1,
          series_count: 0,
        };
      } else {
        build[studyUid].images++;
      }

      // Fix first DICOM file missing study_description
      if (!build[studyUid].study_description && item.study_description) {
        build[studyUid].study_description = item.study_description as string;
      }

      if (!(seriesUid in build[studyUid].series)) {
        build[studyUid].series[seriesUid] = {
          study_instance_uid: studyUid,
          series_instance_uid: seriesUid,
          modality: item.modality,
          series_description: item.series_description,
          body_part_examined: item.body_part,
          series_date: item.series_date,
          series_time: item.series_time,
          study_date: item.study_date,
          series_number: item.series_number,
        };

        build[studyUid].series_count++;

        // Track modalities
        if (item.modality && !build[studyUid].modalities.includes(item.modality as string)) {
          build[studyUid].modalities.push(item.modality as string);
        }
      }
    }

    return build;
  }
}
