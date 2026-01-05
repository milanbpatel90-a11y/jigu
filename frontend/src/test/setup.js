/**
 * Vitest test setup file
 * Configures the test environment for property-based testing
 */

import { afterEach } from 'vitest';

// Clean up after each test
afterEach(() => {
  // Reset any global state if needed
});

// Mock MediaPipe for tests that don't need actual face detection
global.mockMediaPipe = {
  FaceLandmarker: {
    createFromOptions: async () => ({
      detect: () => ({ faceLandmarks: [] }),
      detectForVideo: () => ({ faceLandmarks: [] }),
      close: () => {}
    })
  },
  FilesetResolver: {
    forVisionTasks: async () => ({})
  }
};
