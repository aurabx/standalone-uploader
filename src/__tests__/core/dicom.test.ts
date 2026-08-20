import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DataSet } from 'dicom-parser';
import {
  DicomAttributesType,
  dicomAttributes,
  dicomGetValue,
  dicomShouldReject,
  dicomMap,
  dicomRejects,
  readDicom,
  formatName,
  formatDate,
  formatModalities,
} from '../../core/dicom';

function makeDataSet(overrides: Partial<{
  elements: Record<string, { length: number }>;
  strings: Record<string, string | undefined>;
  uint16Values: Record<string, number | undefined>;
  uint32Values: Record<string, number | undefined>;
}> = {}): DataSet {
  const strings = overrides.strings ?? {};
  const uint16Values = overrides.uint16Values ?? {};
  const uint32Values = overrides.uint32Values ?? {};
  return {
    elements: overrides.elements ?? {},
    warnings: [],
    string: (tag: string) => strings[tag],
    uint16: (tag: string) => uint16Values[tag],
    uint32: (tag: string) => uint32Values[tag],
  } as unknown as DataSet;
}

describe('dicomAttributes / dicomMap', () => {
  it('map keys are round-trippable through dicomAttributes', () => {
    for (const [key, tag] of Object.entries(dicomMap)) {
      const attr = dicomAttributes[tag as keyof typeof dicomAttributes];
      expect(attr, `missing attr for ${tag}`).toBeDefined();
      expect(attr.key).toBe(key);
    }
  });

  it('exposes at least one reject rule', () => {
    expect(dicomRejects.length).toBeGreaterThan(0);
  });
});

describe('dicomGetValue', () => {
  it('returns null when the element is not present', () => {
    const ds = makeDataSet({ elements: {} });
    expect(dicomGetValue(ds, dicomMap.patient_name)).toBeNull();
  });

  it('returns null when the key is not in the attribute map', () => {
    const ds = makeDataSet({
      elements: { xdeadbeef: { length: 4 } },
    });
    expect(dicomGetValue(ds, 'xdeadbeef')).toBeNull();
  });

  it('reads a string attribute', () => {
    const tag = dicomMap.patient_name;
    const ds = makeDataSet({
      elements: { [tag]: { length: 8 } },
      strings: { [tag]: 'DOE^JOHN' },
    });
    expect(dicomGetValue(ds, tag)).toBe('DOE^JOHN');
  });

  it('coerces a missing string value to null', () => {
    const tag = dicomMap.patient_name;
    const ds = makeDataSet({ elements: { [tag]: { length: 8 } } });
    expect(dicomGetValue(ds, tag)).toBeNull();
  });

  it('splits array attributes on backslash', () => {
    const tag = dicomMap.other_patient_ids;
    const ds = makeDataSet({
      elements: { [tag]: { length: 5 } },
      strings: { [tag]: 'a\\b\\c' },
    });
    expect(dicomGetValue(ds, tag)).toEqual(['a', 'b', 'c']);
  });

  it('returns null for missing array attribute', () => {
    const tag = dicomMap.other_patient_ids;
    const ds = makeDataSet({ elements: { [tag]: { length: 0 } } });
    expect(dicomGetValue(ds, tag)).toBeNull();
  });

  it('reads a uint16 for a 2-byte unit attribute', () => {
    // Fabricate a unit attribute entry temporarily.
    const tag = 'xffff0001';
    (dicomAttributes as Record<string, unknown>)[tag] = {
      label: 'Test Unit',
      key: 'test_unit',
      type: DicomAttributesType.DicomAttributesTypeUnit,
    };
    try {
      const ds = makeDataSet({
        elements: { [tag]: { length: 2 } },
        uint16Values: { [tag]: 42 },
      });
      expect(dicomGetValue(ds, tag)).toBe(42);
    } finally {
      delete (dicomAttributes as Record<string, unknown>)[tag];
    }
  });

  it('reads a uint32 for a 4-byte unit attribute', () => {
    const tag = 'xffff0002';
    (dicomAttributes as Record<string, unknown>)[tag] = {
      label: 'Test Unit 32',
      key: 'test_unit32',
      type: DicomAttributesType.DicomAttributesTypeUnit,
    };
    try {
      const ds = makeDataSet({
        elements: { [tag]: { length: 4 } },
        uint32Values: { [tag]: 65_537 },
      });
      expect(dicomGetValue(ds, tag)).toBe(65_537);
    } finally {
      delete (dicomAttributes as Record<string, unknown>)[tag];
    }
  });

  it('returns null when uint reader yields undefined', () => {
    const tag = 'xffff0003';
    (dicomAttributes as Record<string, unknown>)[tag] = {
      label: 'Test Unit Missing',
      key: 'test_unit_missing',
      type: DicomAttributesType.DicomAttributesTypeUnit,
    };
    try {
      const ds = makeDataSet({ elements: { [tag]: { length: 2 } } });
      expect(dicomGetValue(ds, tag)).toBeNull();
    } finally {
      delete (dicomAttributes as Record<string, unknown>)[tag];
    }
  });
});

describe('dicomShouldReject', () => {
  it('returns false for an empty rule', async () => {
    const ds = makeDataSet();
    expect(await dicomShouldReject({}, ds)).toBe(false);
  });

  it('returns true when every field in the rule matches', async () => {
    const ds = makeDataSet({
      elements: {
        [dicomMap.sop_class_uid]: { length: 8 },
        [dicomMap.protocol_name]: { length: 8 },
      },
      strings: {
        [dicomMap.sop_class_uid]: '1.2.840.10008.5.1.4.1.1.66',
        [dicomMap.protocol_name]: 'ExamCard',
      },
    });
    expect(await dicomShouldReject(dicomRejects[0], ds)).toBe(true);
  });

  it('returns false when any field diverges', async () => {
    const ds = makeDataSet({
      elements: {
        [dicomMap.sop_class_uid]: { length: 8 },
        [dicomMap.protocol_name]: { length: 8 },
      },
      strings: {
        [dicomMap.sop_class_uid]: '1.2.840.10008.5.1.4.1.1.66',
        [dicomMap.protocol_name]: 'Cine',
      },
    });
    expect(await dicomShouldReject(dicomRejects[0], ds)).toBe(false);
  });
});

describe('formatName', () => {
  it('returns the input for an empty string', () => {
    expect(formatName('')).toBe('');
  });

  it('returns the input for a single component', () => {
    expect(formatName('CHER')).toBe('CHER');
  });

  it('reorders DOE^JOHN into JOHN  DOE (no middle segment)', () => {
    // The formatter always renders "<last> <middle> <first>"; with no
    // middle segment the middle slot is empty, producing a double space.
    expect(formatName('DOE^JOHN')).toBe('JOHN  DOE');
  });

  it('re-orders and preserves middle names', () => {
    expect(formatName('DOE^JOHN^MICHAEL')).toBe('MICHAEL JOHN DOE');
  });
});

describe('formatDate', () => {
  it('returns empty string for missing or wrong-length input', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('20240')).toBe('');
  });

  it('formats a valid DICOM date', () => {
    const formatted = formatDate('20240115');
    expect(formatted).not.toBe('');
    expect(formatted).toContain('2024');
  });

  it('returns empty when the date parses to NaN', () => {
    // 'xxxx9999' → parseInt('xxxx') === NaN → new Date(NaN,...) is Invalid.
    expect(formatDate('xxxx9999')).toBe('');
  });
});

describe('formatModalities', () => {
  it('handles missing series map', () => {
    expect(formatModalities({} as never)).toBe('');
  });

  it('deduplicates modality codes', () => {
    const result = formatModalities({
      series: {
        a: { modality: 'CT' },
        b: { modality: 'MR' },
        c: { modality: 'CT' },
      },
    });
    expect(result).toBe('CT, MR');
  });

  it('ignores series without a modality', () => {
    const result = formatModalities({
      series: {
        a: { modality: 'CT' },
        b: { modality: '' },
      },
    });
    expect(result).toBe('CT');
  });
});

describe('readDicom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads a small blob straight through', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4]).buffer]);
    const buf = await readDicom(blob);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('slices oversized files down to the header window', async () => {
    const HEADER_MAX = 20 * 1024 * 1024;
    const sliceSpy = vi.fn().mockReturnValue(
      new Blob([new Uint8Array([9, 9, 9]).buffer]),
    );
    const fakeBlob = {
      size: HEADER_MAX + 1,
      slice: sliceSpy,
    } as unknown as Blob;
    const buf = await readDicom(fakeBlob);
    expect(sliceSpy).toHaveBeenCalledWith(0, HEADER_MAX);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([9, 9, 9]));
  });

  it('rejects when the FileReader errors', async () => {
    class FailingReader {
      onerror: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      onload: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      error: DOMException | null = new DOMException('boom', 'NotReadableError');
      result: ArrayBuffer | string | null = null;
      abort = vi.fn();
      readAsArrayBuffer(): void {
        queueMicrotask(() => {
          this.onerror?.call(this as unknown as FileReader, {} as ProgressEvent);
        });
      }
    }
    const original = globalThis.FileReader;
    (globalThis as { FileReader: unknown }).FileReader = FailingReader;

    try {
      await expect(
        readDicom(new Blob([new Uint8Array([1]).buffer])),
      ).rejects.toThrow('boom');
    } finally {
      (globalThis as { FileReader: unknown }).FileReader = original;
    }
  });

  it('falls back to defaults when the reader error is missing', async () => {
    class BareErrorReader {
      onerror: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      onload: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      error: DOMException | null = null;
      result: ArrayBuffer | string | null = null;
      abort = vi.fn();
      readAsArrayBuffer(): void {
        queueMicrotask(() => {
          this.onerror?.call(this as unknown as FileReader, {} as ProgressEvent);
        });
      }
    }
    const original = globalThis.FileReader;
    (globalThis as { FileReader: unknown }).FileReader = BareErrorReader;

    try {
      const err = await readDicom(
        new Blob([new Uint8Array([1]).buffer]),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe('NotReadableError');
    } finally {
      (globalThis as { FileReader: unknown }).FileReader = original;
    }
  });
});
