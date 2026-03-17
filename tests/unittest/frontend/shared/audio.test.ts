import { describe, it, expect } from 'vitest';
import { float32ToInt16, arrayBufferToBase64, base64ToUint8 } from '@/shared/audio';

describe('audio utilities', () => {
  describe('float32ToInt16', () => {
    it('converts silence (all zeros) correctly', () => {
      const input = new Float32Array([0, 0, 0]);
      const result = float32ToInt16(input);
      expect(result).toBeInstanceOf(Int16Array);
      expect(result.length).toBe(3);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });

    it('converts max positive value (1.0) to 0x7fff', () => {
      const input = new Float32Array([1.0]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(0x7fff);
    });

    it('converts max negative value (-1.0) to -0x8000', () => {
      const input = new Float32Array([-1.0]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(-0x8000);
    });

    it('clamps values above 1.0', () => {
      const input = new Float32Array([2.0, 5.0]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(0x7fff);
      expect(result[1]).toBe(0x7fff);
    });

    it('clamps values below -1.0', () => {
      const input = new Float32Array([-2.0, -10.0]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(-0x8000);
      expect(result[1]).toBe(-0x8000);
    });

    it('converts mid-range positive value correctly', () => {
      const input = new Float32Array([0.5]);
      const result = float32ToInt16(input);
      // 0.5 * 0x7fff = 16383.5, should be 16383 (truncated)
      expect(result[0]).toBe(Math.floor(0.5 * 0x7fff));
    });

    it('converts mid-range negative value correctly', () => {
      const input = new Float32Array([-0.5]);
      const result = float32ToInt16(input);
      // -0.5 * 0x8000 = -16384
      expect(result[0]).toBe(-0.5 * 0x8000);
    });

    it('handles empty input', () => {
      const input = new Float32Array([]);
      const result = float32ToInt16(input);
      expect(result.length).toBe(0);
    });

    it('preserves array length', () => {
      const input = new Float32Array(1024);
      const result = float32ToInt16(input);
      expect(result.length).toBe(1024);
    });
  });

  describe('arrayBufferToBase64', () => {
    it('encodes empty buffer', () => {
      const buf = new ArrayBuffer(0);
      const result = arrayBufferToBase64(buf);
      expect(result).toBe('');
    });

    it('encodes a simple byte sequence', () => {
      const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = arrayBufferToBase64(arr.buffer);
      expect(result).toBe(btoa('Hello'));
    });

    it('encodes and can be decoded back', () => {
      const original = new Uint8Array([0, 1, 2, 127, 128, 255]);
      const b64 = arrayBufferToBase64(original.buffer);
      const decoded = base64ToUint8(b64);
      expect(decoded).toEqual(original);
    });

    it('handles large buffers without stack overflow (chunked processing)', () => {
      // Create a buffer larger than 8192 bytes to test chunking
      const size = 20000;
      const arr = new Uint8Array(size);
      for (let i = 0; i < size; i++) arr[i] = i % 256;
      const result = arrayBufferToBase64(arr.buffer);
      expect(result.length).toBeGreaterThan(0);
      // Verify round-trip
      const decoded = base64ToUint8(result);
      expect(decoded.length).toBe(size);
      expect(decoded[0]).toBe(0);
      expect(decoded[255]).toBe(255);
      expect(decoded[256]).toBe(0);
    });
  });

  describe('base64ToUint8', () => {
    it('decodes empty string', () => {
      const result = base64ToUint8(btoa(''));
      expect(result.length).toBe(0);
    });

    it('decodes a simple base64 string', () => {
      const result = base64ToUint8(btoa('Hello'));
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('returns Uint8Array type', () => {
      const result = base64ToUint8(btoa('test'));
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('handles binary data with full byte range', () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) original[i] = i;
      const b64 = arrayBufferToBase64(original.buffer);
      const decoded = base64ToUint8(b64);
      expect(decoded).toEqual(original);
    });
  });

  describe('round-trip: float32 -> int16 -> base64 -> uint8', () => {
    it('preserves data through encoding pipeline', () => {
      const float32 = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
      const int16 = float32ToInt16(float32);
      const b64 = arrayBufferToBase64(int16.buffer);
      const decoded = base64ToUint8(b64);
      // The decoded bytes should match the int16 buffer bytes
      const int16Bytes = new Uint8Array(int16.buffer);
      expect(decoded).toEqual(int16Bytes);
    });
  });
});
