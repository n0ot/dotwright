export interface LouisModule {
  HEAPU16: Uint16Array;
  HEAP32: Int32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _lou_translate(...args: number[]): number;
  _lou_backTranslate(...args: number[]): number;
  stringToUTF8(str: string, ptr: number, max: number): void;
}
export default function createLouis(): Promise<LouisModule>;
