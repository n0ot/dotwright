// Minimal typings for the File System Access API (Chrome and Edge only).
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
declare global {
  interface Window {
    showOpenFilePicker?(options?: PickerOptions): Promise<FileHandle[]>;
    showSaveFilePicker?(options?: PickerOptions): Promise<FileHandle>;
  }
}

export type { FileHandle };

const TYPES = [{ description: 'Braille file', accept: { 'text/plain': ['.brf'] } }];

export interface OpenedFile {
  name: string;
  data: string;
  handle: FileHandle | null;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Lets the learner choose a BRF file. Resolves to null if they cancel. */
export async function openBrf(): Promise<OpenedFile | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: TYPES });
      const file = await handle.getFile();
      return { name: file.name, data: await file.text(), handle };
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.brf,.brl,.txt';
  const file = await new Promise<File | null>((resolve) => {
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
  return file ? { name: file.name, data: await file.text(), handle: null } : null;
}

export interface SavedFile {
  name: string;
  handle: FileHandle | null;
  /** 'file' wrote to a chosen file; 'download' handed the browser a download. */
  method: 'file' | 'download';
}

/**
 * Saves BRF content. With an existing handle it writes in place; otherwise it
 * asks where to save, or downloads where the browser can't write files.
 */
export async function saveBrf(
  content: string,
  name: string,
  handle: FileHandle | null,
  saveAs: boolean,
): Promise<SavedFile | null> {
  const blob = new Blob([content], { type: 'text/plain' });
  if (window.showSaveFilePicker) {
    try {
      const target = handle && !saveAs ? handle : await window.showSaveFilePicker({ suggestedName: name, types: TYPES });
      const writable = await target.createWritable();
      await writable.write(blob);
      await writable.close();
      return { name: target.name, handle: target, method: 'file' };
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { name, handle: null, method: 'download' };
}
