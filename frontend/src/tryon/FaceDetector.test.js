/**
 * Property-Based Tests for FaceDetector
 * Feature: face-landmark-tryon
 * 
 * Tests validate:
 * - Property 1: No-face detection returns valid empty result
 * - Property 2: Largest face selection
 * - Property 3: Low confidence indication
 * 
 * Validates: Requirements 1.3, 1.4, 1.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { FaceDetector } from './FaceDetector.js';
import { REFERENCE_VALUES } from './types.js';

// Helper to create 32-bit float constraints
const f32 = (val) => Math.fround(val);

/**
 * Generate a mock landmark point with normalized coordinates
 */
const landmarkArb = fc.record({
  x: fc.float({ min: f32(0), max: f32(1), noNaN: true }),
  y: fc.float({ min: f32(0), max: f32(1), noNaN: true }),
  z: fc.float({ min: f32(0), max: f32(1), noNaN: true })
});

/**
 * Generate 478 landmarks for a complete face mesh
 */
const faceLandmarksArb = fc.array(landmarkArb, { minLength: 478, maxLength: 478 });

describe('FaceDetector Property Tests', () => {
  let detector;

  beforeEach(() => {
    detector = new FaceDetector();
  });

  /**
   * Property 1: No-face detection returns valid empty result
   * 
   * For any input where no face is detected, the Face_Detector SHALL return
   * a valid FaceDetectionResult with detected: false and face: null without
   * throwing an exception.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 1: No-face detection returns valid empty result', () => {
    it('should return valid empty result for empty faceLandmarks array', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          // Simulate MediaPipe result with no faces
          const emptyResults = [
            { faceLandmarks: [] },
            { faceLandmarks: null },
            { faceLandmarks: undefined },
            {}
          ];

          for (const mockResult of emptyResults) {
            const result = detector._processDetectionResult(mockResult);
            
            // Must have detected: false
            expect(result.detected).toBe(false);
            // Must have face: null
            expect(result.face).toBeNull();
            // Must have valid timestamp
            expect(typeof result.timestamp).toBe('number');
            expect(result.timestamp).toBeGreaterThan(0);
            // Must have lowConfidence field
            expect(typeof result.lowConfidence).toBe('boolean');
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should never throw exception for no-face scenarios', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ faceLandmarks: [] }),
            fc.constant({ faceLandmarks: null }),
            fc.constant({}),
            fc.constant({ faceLandmarks: undefined })
          ),
          (mockResult) => {
            // Should not throw
            expect(() => detector._processDetectionResult(mockResult)).not.toThrow();
            
            const result = detector._processDetectionResult(mockResult);
            return result.detected === false && result.face === null;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Largest face selection
   * 
   * For any set of detected face bounding boxes where multiple faces are present,
   * the Face_Detector SHALL select the face with the largest bounding box area
   * (width × height).
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 2: Largest face selection', () => {
    it('should select face with largest bounding box area', () => {
      fc.assert(
        fc.property(
          // Generate 2-5 faces with different bounding boxes
          fc.integer({ min: 2, max: 5 }).chain(numFaces => {
            return fc.array(
              fc.tuple(
                fc.float({ min: f32(0), max: f32(0.4), noNaN: true }),  // xMin
                fc.float({ min: f32(0), max: f32(0.4), noNaN: true }),  // yMin
                fc.float({ min: f32(0.1), max: f32(0.5), noNaN: true }), // width
                fc.float({ min: f32(0.1), max: f32(0.5), noNaN: true })  // height
              ),
              { minLength: numFaces, maxLength: numFaces }
            );
          }),
          (faceBounds) => {
            // Create mock faces with landmarks within their bounds
            const faceLandmarks = faceBounds.map(([xMin, yMin, width, height]) => {
              // Create 478 landmarks within the bounding box
              const landmarks = [];
              for (let i = 0; i < 478; i++) {
                landmarks.push({
                  x: xMin + Math.random() * width,
                  y: yMin + Math.random() * height,
                  z: Math.random()
                });
              }
              return landmarks;
            });

            // Calculate expected largest face index
            let expectedIndex = 0;
            let maxArea = 0;
            faceBounds.forEach(([xMin, yMin, width, height], index) => {
              const area = width * height;
              if (area > maxArea) {
                maxArea = area;
                expectedIndex = index;
              }
            });

            // Test the selection
            const selectedIndex = detector._selectLargestFace(faceLandmarks);
            
            // Verify the selected face has the largest area
            const selectedBounds = faceBounds[selectedIndex];
            const selectedArea = selectedBounds[2] * selectedBounds[3];
            
            // The selected area should be >= all other areas
            for (const [, , w, h] of faceBounds) {
              expect(selectedArea).toBeGreaterThanOrEqual(w * h - 0.0001); // Small epsilon for float comparison
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return index 0 for single face', () => {
      fc.assert(
        fc.property(faceLandmarksArb, (landmarks) => {
          const result = detector._selectLargestFace([landmarks]);
          return result === 0;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Low confidence indication
   * 
   * For any face detection result where the confidence value is less than 0.7,
   * the result SHALL be flagged as low confidence.
   * 
   * **Validates: Requirements 1.5**
   */
  describe('Property 3: Low confidence indication', () => {
    it('should flag low confidence when confidence < 0.7', () => {
      fc.assert(
        fc.property(
          // Generate landmarks that will produce low confidence
          // Small bounding box = low coverage = low confidence
          fc.tuple(
            fc.float({ min: f32(0.4), max: f32(0.5), noNaN: true }),  // xMin (centered)
            fc.float({ min: f32(0.4), max: f32(0.5), noNaN: true }),  // yMin (centered)
            fc.float({ min: f32(0.01), max: f32(0.1), noNaN: true }), // small width
            fc.float({ min: f32(0.01), max: f32(0.1), noNaN: true })  // small height
          ),
          ([xMin, yMin, width, height]) => {
            // Create landmarks within small bounding box (low coverage = low confidence)
            const landmarks = [];
            for (let i = 0; i < 478; i++) {
              landmarks.push({
                x: xMin + Math.random() * width,
                y: yMin + Math.random() * height,
                z: Math.random()
              });
            }

            const mockResult = { faceLandmarks: [landmarks] };
            const result = detector._processDetectionResult(mockResult);

            // Small faces should have low confidence
            if (result.face && result.face.confidence < REFERENCE_VALUES.MIN_CONFIDENCE) {
              expect(result.lowConfidence).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not flag low confidence when confidence >= 0.7', () => {
      fc.assert(
        fc.property(
          // Generate landmarks that will produce high confidence
          // Large bounding box = high coverage = high confidence
          fc.tuple(
            fc.float({ min: f32(0.1), max: f32(0.2), noNaN: true }),  // xMin
            fc.float({ min: f32(0.1), max: f32(0.2), noNaN: true }),  // yMin
            fc.float({ min: f32(0.5), max: f32(0.7), noNaN: true }),  // large width
            fc.float({ min: f32(0.5), max: f32(0.7), noNaN: true })   // large height
          ),
          ([xMin, yMin, width, height]) => {
            // Create landmarks within large bounding box (high coverage = high confidence)
            const landmarks = [];
            for (let i = 0; i < 478; i++) {
              landmarks.push({
                x: xMin + Math.random() * width,
                y: yMin + Math.random() * height,
                z: Math.random()
              });
            }

            const mockResult = { faceLandmarks: [landmarks] };
            const result = detector._processDetectionResult(mockResult);

            // Large faces should have high confidence
            if (result.face && result.face.confidence >= REFERENCE_VALUES.MIN_CONFIDENCE) {
              expect(result.lowConfidence).toBe(false);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly correlate lowConfidence flag with confidence threshold', () => {
      fc.assert(
        fc.property(faceLandmarksArb, (landmarks) => {
          const mockResult = { faceLandmarks: [landmarks] };
          const result = detector._processDetectionResult(mockResult);

          if (result.detected && result.face) {
            // lowConfidence should be true IFF confidence < MIN_CONFIDENCE
            const expectedLowConfidence = result.face.confidence < REFERENCE_VALUES.MIN_CONFIDENCE;
            expect(result.lowConfidence).toBe(expectedLowConfidence);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
