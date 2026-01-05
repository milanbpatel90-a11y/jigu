/**
 * Tests for type definitions and constants
 * Feature: face-landmark-tryon
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  LANDMARK_INDICES, 
  REFERENCE_VALUES, 
  DEFAULT_FACE_DETECTOR_CONFIG,
  DEFAULT_RENDERER_CONFIG,
  DEFAULT_ADJUSTMENTS 
} from './types.js';

describe('Type Constants', () => {
  it('should have valid landmark indices', () => {
    expect(LANDMARK_INDICES.LEFT_EYE_CENTER).toBe(468);
    expect(LANDMARK_INDICES.RIGHT_EYE_CENTER).toBe(473);
    expect(LANDMARK_INDICES.NOSE_BRIDGE_TOP).toBe(6);
    expect(LANDMARK_INDICES.LEFT_EAR).toBe(234);
    expect(LANDMARK_INDICES.RIGHT_EAR).toBe(454);
  });

  it('should have valid reference values', () => {
    expect(REFERENCE_VALUES.IPD).toBeGreaterThan(0);
    expect(REFERENCE_VALUES.MIN_CONFIDENCE).toBe(0.7);
  });

  it('should have valid default configs', () => {
    expect(DEFAULT_FACE_DETECTOR_CONFIG.maxFaces).toBe(1);
    expect(DEFAULT_FACE_DETECTOR_CONFIG.refineLandmarks).toBe(true);
    expect(DEFAULT_FACE_DETECTOR_CONFIG.minDetectionConfidence).toBe(0.7);
  });
});

describe('Property-Based Test Setup Verification', () => {
  // Verify fast-check is working correctly
  it('should run property-based tests with fast-check', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 477 }), (index) => {
        // All landmark indices should be valid (0-477 for 478 points)
        return index >= 0 && index <= 477;
      }),
      { numRuns: 100 }
    );
  });

  it('should generate valid normalized coordinates', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (x, y, z) => {
          // All coordinates should be in [0, 1] range
          return x >= 0 && x <= 1 && y >= 0 && y <= 1 && z >= 0 && z <= 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});
