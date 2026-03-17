import '@testing-library/jest-dom';

// Mock BroadcastChannel for jsdom
class MockBroadcastChannel {
  name: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage(_data: unknown) {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

if (typeof globalThis.BroadcastChannel === 'undefined') {
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;
}

// Mock performance.now if not available
if (typeof performance === 'undefined') {
  (globalThis as any).performance = { now: () => Date.now() };
}

// Mock Element.scrollIntoView (not available in jsdom)
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// Mock URL.createObjectURL (not available in jsdom)
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock-url';
  URL.revokeObjectURL = () => {};
}
