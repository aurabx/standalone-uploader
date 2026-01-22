/**
 * Configuration options for StandaloneAuraloader
 */
export interface AuraloaderConfig {
  /** API token for authentication */
  apiToken: string;
  /** Base URL for the Aura API (e.g., 'https://aura-instance.com/api') */
  apiBaseUrl: string;
  /** DOM element ID where the uploader should be mounted */
  containerId: string;
  /** Optional patient ID to associate uploads with */
  patientId?: string;
  /** Optional app credentials identifying the application integration */
  app?: {
    /** Application integration ID */
    id: string;
    /** Application integration token */
    token: string;
  };
  /** Optional context object for additional metadata */
  context?: Record<string, unknown>;
  /** Optional callbacks for upload events */
  callbacks?: AuraloaderCallbacks;
}

export interface AuraloaderCallbacks {
  onUploadComplete?: (result: UploadResult) => void;
  onUploadError?: (error: AuraloaderError) => void;
  onUploadCancel?: () => void;
  onStudiesFound?: (studies: StudyInfo[]) => void;
  onStateChange?: (state: UploaderState) => void;
}

/**
 * Upload workflow steps
 */
export type UploaderStep = 
  | 'start'      // Initial drag-drop state
  | 'processing' // Processing DICOM files
  | 'pending'    // Files processed, awaiting upload confirmation
  | 'uploading'  // Upload in progress
  | 'complete'   // Upload finished successfully
  | 'error'      // Error occurred
  | 'cancelled'; // Upload cancelled

/**
 * Internal state for the uploader
 */
export interface UploaderState {
  step: UploaderStep;
  totalFiles: number;
  studiesCount: number;
  seriesCount: number;
  studies: StudyInfo[];
  complete: boolean;
  studyId: string;
  zipping: boolean;
  errorMessage: string;
  connectionIssues: boolean;
}

/**
 * DICOM Study information extracted from files
 */
export interface StudyInfo {
  study_uid: string;
  patient_name: string;
  patient_id: string;
  study_date: string;
  study_time: string;
  study_description: string;
  institution_name: string;
  modalities: string[];
  series_count: number;
  images: number;
}

/**
 * Series information
 */
export interface SeriesInfo {
  series_uid: string;
  series_description: string;
  modality: string;
  images: number;
}

/**
 * API response for upload configuration
 */
export interface UploaderConfigResponse {
  lift: {
    endpoint: string;
    token: string;
    bucket: string;
  };
  mode: string;
}

/**
 * API request for upload init
 */
export interface UploadInitRequest {
  upload_id: string;
  studies: Record<string, StudyInfo>;
  mode: string;
  source: string;
  patient_id?: string;
  app?: {
    id: string;
    token: string;
  };
  context?: Record<string, unknown>;
}

/**
 * API response for upload init
 */
export interface UploadInitResponse {
  studies: Array<{ id: string }>;
}

/**
 * Upload lifecycle request
 */
export interface UploadLifecycleRequest {
  upload_id: string;
  assembly_id?: string;
  mode?: string;
  message?: string;
}

/**
 * Result of a completed upload
 */
export interface UploadResult {
  uploadId: string;
  studies: Array<{ id: string }>;
  successful: number;
  failed: number;
}

/**
 * Auraloader error
 */
export interface AuraloaderError {
  context: string;
  message: string;
  statusCode?: number;
}

/**
 * DICOM metadata extracted from a file
 */
export interface DicomMetadata {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  institutionName: string;
}

/**
 * DICOM tag mapping
 */
export interface DicomTagMap {
  [key: string]: {
    tag: string;
    name: string;
  };
}
