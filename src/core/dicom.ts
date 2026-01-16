/**
 * DICOM parsing utilities
 * Ported from aura auraloader library
 */
import dicomParser from 'dicom-parser';

export enum DicomAttributesType {
  DicomAttributesTypeUnit = 'unit',
  DicomAttributesTypeString = 'string',
  DicomAttributesTypeArray = 'array',
}

export interface DicomAttribute {
  label: string;
  key: string;
  type: DicomAttributesType;
}

export interface DicomAttributes {
  [key: string]: DicomAttribute;
}

export interface DicomRejectItems {
  [key: string]: string;
}

// Files matching these criteria will be rejected
export const dicomRejects: DicomRejectItems[] = [
  {
    x00080016: '1.2.840.10008.5.1.4.1.1.66', // SOP Class UID
    x00181030: 'ExamCard', // Protocol Name
  },
];

/**
 * Mapping for all DICOM attributes
 */
export const dicomAttributes: DicomAttributes = {
  // Patient Information
  x00100010: {
    label: 'Patient Name',
    key: 'patient_name',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00100020: {
    label: 'Patient ID',
    key: 'patient_id',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00101000: {
    label: 'Other Patient IDs',
    key: 'other_patient_ids',
    type: DicomAttributesType.DicomAttributesTypeArray,
  },
  x00100030: {
    label: 'Patient Birth Date',
    key: 'patient_birth_date',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00100040: {
    label: 'Patient Sex',
    key: 'patient_sex',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00100021: {
    label: 'IssuerOfPatientID',
    key: 'issuer_of_patient_id',
    type: DicomAttributesType.DicomAttributesTypeString,
  },

  // Doctor
  x00080090: {
    label: 'Referring Physician Name',
    key: 'referring_physician_name',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080081: {
    label: 'Institution Address',
    key: 'institution_address',
    type: DicomAttributesType.DicomAttributesTypeString,
  },

  // Study Information
  x00081030: {
    label: 'Study Description',
    key: 'study_description',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00181030: {
    label: 'Protocol Name',
    key: 'protocol_name',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080050: {
    label: 'Accession #',
    key: 'accession_no',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00200010: {
    label: 'Study Id',
    key: 'study_id',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080020: {
    label: 'Study Date',
    key: 'study_date',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080030: {
    label: 'Study Time',
    key: 'study_time',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080201: {
    label: 'Timezone Offset From UTC Attribute',
    key: 'tz_offset',
    type: DicomAttributesType.DicomAttributesTypeString,
  },

  // Series Information
  x0008103e: {
    label: 'Series Description',
    key: 'series_description',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00200011: {
    label: 'Series #',
    key: 'series_number',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080060: {
    label: 'Modality',
    key: 'modality',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00180015: {
    label: 'Body Part',
    key: 'body_part',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080021: {
    label: 'Series Date',
    key: 'series_date',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080031: {
    label: 'Series Time',
    key: 'series_time',
    type: DicomAttributesType.DicomAttributesTypeString,
  },

  // UIDS
  x0020000d: {
    label: 'Study UID',
    key: 'study_uid',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x0020000e: {
    label: 'Series UID',
    key: 'series_uid',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080018: {
    label: 'Instance UID',
    key: 'instance_uid',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
  x00080016: {
    label: 'SOP Class UID',
    key: 'sop_class_uid',
    type: DicomAttributesType.DicomAttributesTypeString,
  },

  // Equipment Information
  x00080080: {
    label: 'Institution Name',
    key: 'institution_name',
    type: DicomAttributesType.DicomAttributesTypeString,
  },
};

export const dicomMap = {
  // Patient Information
  patient_name: 'x00100010',
  patient_id: 'x00100020',
  other_patient_ids: 'x00101000',
  patient_birth_date: 'x00100030',
  patient_sex: 'x00100040',

  // Doctor
  referring_physician_name: 'x00080090',
  institution_address: 'x00080081',
  issuer_of_patient_id: 'x00100021',

  // Study Information
  study_description: 'x00081030',
  protocol_name: 'x00181030',
  accession_no: 'x00080050',
  study_id: 'x00200010',
  study_date: 'x00080020',
  study_time: 'x00080030',
  tz_offset: 'x00080201',

  // Series Information
  series_description: 'x0008103e',
  series_number: 'x00200011',
  modality: 'x00080060',
  body_part: 'x00180015',
  series_date: 'x00080021',
  series_time: 'x00080031',

  // UIDS
  study_uid: 'x0020000d',
  series_uid: 'x0020000e',
  instance_uid: 'x00080018',
  sop_class_uid: 'x00080016',

  // Equipment
  institution_name: 'x00080080',
};

/**
 * Get a value from a DICOM dataset by key
 */
export const dicomGetValue = (
  dataSet: dicomParser.DataSet,
  key: string
): string | number | string[] | null => {
  const element = dataSet.elements[key];

  if (element === undefined) {
    return null;
  }

  if (!(key in dicomAttributes)) {
    return null;
  }

  const field: DicomAttribute = dicomAttributes[key];

  if (field.type === DicomAttributesType.DicomAttributesTypeUnit) {
    const value = element.length === 2 ? dataSet.uint16(key) : dataSet.uint32(key);
    return value ?? null;
  }

  if (field.type === DicomAttributesType.DicomAttributesTypeString) {
    return dataSet.string(key) ?? null;
  }

  if (field.type === DicomAttributesType.DicomAttributesTypeArray) {
    return dataSet.string(key)?.split('\\') ?? null;
  }

  return null;
};

/**
 * Check if a file should be rejected based on DICOM attributes
 */
export const dicomShouldReject = async (
  dicomReject: DicomRejectItems,
  dataSet: dicomParser.DataSet
): Promise<boolean> => {
  const ands: boolean[] = [];
  for (const key in dicomReject) {
    const foundValue = dicomGetValue(dataSet, key);
    ands.push(foundValue === dicomReject[key]);
  }

  if (ands.length === 0) {
    return false;
  }

  return ands.every((and) => and === true);
};

/**
 * Read a file as ArrayBuffer for DICOM parsing
 */
export const readDicom = (file: File | Blob): Promise<ArrayBuffer> => {
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onerror = () => {
      reader.abort();
      const error = reader.error;
      reject(
        new DOMException(
          error?.message || 'Problem parsing input file.',
          error?.name || 'NotReadableError'
        )
      );
    };

    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };

    reader.readAsArrayBuffer(file);
  });
};

/**
 * Format a DICOM patient name (e.g., "DOE^JOHN^M" -> "John M Doe")
 */
export const formatName = (name: string): string => {
  if (!name) {
    return name;
  }

  const parts = name.split('^');
  let builtName = '';
  parts.forEach((part, index, array) => {
    if (index !== 0 && index !== array.length - 1) {
      builtName += part + ' ';
    }
  });

  return parts.length >= 2
    ? `${parts[parts.length - 1]} ${builtName.trimEnd()} ${parts[0]}`
    : name;
};

/**
 * Format a DICOM date (e.g., "20240115" -> "Mon, Jan 15, 2024")
 */
export const formatDate = (date: string): string => {
  if (!date || date.length !== 8) {
    return '';
  }

  const year = parseInt(date.substring(0, 4), 10);
  const month = parseInt(date.substring(4, 6), 10) - 1;
  const day = parseInt(date.substring(6, 8), 10);

  const dateObj = new Date(year, month, day);
  
  if (isNaN(dateObj.getTime())) {
    return '';
  }

  return dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format modalities from a study object
 */
export const formatModalities = (study: {
  series: { [key: string]: { modality: string } };
}): string => {
  if (!study?.series) {
    return '';
  }

  let modalities: string[] = [];

  Object.entries(study.series).forEach(([, series]) => {
    if (series.modality) {
      modalities.push(series.modality);
    }
  });

  modalities = [...new Set(modalities)];

  return modalities.join(', ');
};
