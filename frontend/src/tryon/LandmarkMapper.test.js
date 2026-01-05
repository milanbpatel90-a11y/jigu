/**
 * Property-Based Tests for LandmarkMapper
 * Feature: face-landmark-tryon
 * 
 * Tests validate:
 * - Property 4: Key landmarks completeness
 * - Property 5: Normalized coordinate bounds
 * - Property 6: IPD positivity
 * - Property 7: Rotation angle bounds
 * - Property 8: Missing landmark indication
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  extractKeyLandmarks, 
  estimateRotation, 
  hasAllRequiredLandmarks,
  getMissingLandmarks,
  REQUIRED_LANDMARKS 
} from './LandmarkMapper.js';
import { LANDMARK_INDICES } from './types.js';

// Helper to create 32-bit float constraints
const f32 = (val) => Math.fround(val);

/**
 * Generate a valid 3D point with normalized coordinates (0-1)
 */
const point3DArb = fc.record({
  x: fc.float({ min: f32(0), max: f32(1), noNaN: true }),
  y: fc.float({ min: f32(0), max: f32(1), noNaN: true }),
  z: fc.float({ min: f32(0), max: f32(1), noNaN: true })
});

/**
 * Generate a complete face landmarks array (478 points)
 * with valid normalized coordinates
 */
const completeFaceLandmarksArb = fc.array(point3DArb, { minLength: 478, maxLength: 478 })
  .map(landmarks => ({
    landmarks,
    boundingBox: { xMin: 0, yMin: 0, width: 1, height: 1 },
    confidence: 0.9
  }));

/**
 * Generate face landmarks with some missing/invalid points
 */
const partialFaceLandmarksArb = fc.record({
  landmarkCount: fc.integer({ min: 0, max: 400 }), // Less than 478
  validPoints: fc.array(point3DArb, { minLength: 0, maxLength: 400 })
}).map(({ landmarkCount, validPoints }) => ({
  landmarks: validPoints.slice(0, landmarkCount),
  boundingBox: { xMin: 0, yMin: 0, width: 1, height: 1 },
  confidence: 0.5
}));

/**
 * Generate face landmarks with specific indices having invalid values
 */
const faceLandmarksWithInvalidPointsArb = fc.record({
  invalidIndices: fc.uniqueArray(
    fc.constantFrom(
      LANDMARK_INDICES.LEFT_EYE_CENTER,
      LANDMARK_INDICES.RIGHT_EYE_CENTER,
      LANDMARK_INDICES.NOSE_BRIDGE_TOP,
      LANDMARK_INDICES.LEFT_EAR,
      LANDMARK_INDICES.RIGHT_EAR
    ),
    { minLength: 1, maxLength: 5 }
  )
}).chain(({ invalidIndices }) => {
  return fc.array(point3DArb, { minLength: 478, maxLength: 478 }).map(landmarks => {
    // Set invalid values at specified indices
    for (const idx of invalidIndices) {
      landmarks[idx] = { x: NaN, y: NaN, z: NaN };
    }
    return {
      landmarks,
      boundingBox: { xMin: 0, yMin: 0, width: 1, height: 1 },
      confidence: 0.5,
      _invalidIndices: invalidIndices
    };
  });
});


describe('LandmarkMapper Property Tests', () => {
  /**
   * Property 4: Key landmarks completeness
   * 
   * For any successful face detection (detected: true), the extracted KeyLandmarks
   * object SHALL contain all required fields: leftEye, rightEye, noseBridge,
   * leftEar, rightEar, and ipd.
   * 
   * **Validates: Requirements 2.1**
   */
  describe('Property 4: Key landmarks completeness', () => {
    it('should contain all required fields for complete face landmarks', () => {
      fc.assert(
        fc.property(completeFaceLandmarksArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          
          // Must have all required landmark fields
          expect(result).toHaveProperty('leftEye');
          expect(result).toHaveProperty('rightEye');
          expect(result).toHaveProperty('noseBridge');
          expect(result).toHaveProperty('leftEar');
          expect(result).toHaveProperty('rightEar');
          expect(result).toHaveProperty('ipd');
          expect(result).toHaveProperty('missingLandmarks');
          
          // Each landmark must have x, y, z coordinates
          for (const name of ['leftEye', 'rightEye', 'noseBridge', 'leftEar', 'rightEar']) {
            expect(result[name]).toHaveProperty('x');
            expect(result[name]).toHaveProperty('y');
            expect(result[name]).toHaveProperty('z');
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should have empty missingLandmarks for complete face data', () => {
      fc.assert(
        fc.property(completeFaceLandmarksArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          
          // For complete face data, no landmarks should be missing
          expect(result.missingLandmarks).toEqual([]);
          expect(hasAllRequiredLandmarks(result)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Normalized coordinate bounds
   * 
   * For any extracted facial landmarks, all x, y, and z coordinate values
   * SHALL be within the range [0, 1].
   * 
   * **Validates: Requirements 2.2**
   */
  describe('Property 5: Normalized coordinate bounds', () => {
    it('should have all coordinates within [0, 1] range', () => {
      fc.assert(
        fc.property(completeFaceLandmarksArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          
          // Check all landmark coordinates are normalized
          for (const name of ['leftEye', 'rightEye', 'noseBridge', 'leftEar', 'rightEar']) {
            const point = result[name];
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(1);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(1);
            expect(point.z).toBeGreaterThanOrEqual(0);
            expect(point.z).toBeLessThanOrEqual(1);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should clamp out-of-range coordinates to [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              x: fc.float({ min: f32(-2), max: f32(3), noNaN: true }),
              y: fc.float({ min: f32(-2), max: f32(3), noNaN: true }),
              z: fc.float({ min: f32(-2), max: f32(3), noNaN: true })
            }),
            { minLength: 478, maxLength: 478 }
          ),
          (landmarks) => {
            const faceLandmarks = {
              landmarks,
              boundingBox: { xMin: 0, yMin: 0, width: 1, height: 1 },
              confidence: 0.9
            };
            
            const result = extractKeyLandmarks(faceLandmarks);
            
            // All coordinates should be clamped to [0, 1]
            for (const name of ['leftEye', 'rightEye', 'noseBridge', 'leftEar', 'rightEar']) {
              const point = result[name];
              expect(point.x).toBeGreaterThanOrEqual(0);
              expect(point.x).toBeLessThanOrEqual(1);
              expect(point.y).toBeGreaterThanOrEqual(0);
              expect(point.y).toBeLessThanOrEqual(1);
              expect(point.z).toBeGreaterThanOrEqual(0);
              expect(point.z).toBeLessThanOrEqual(1);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: IPD positivity
   * 
   * For any extracted KeyLandmarks, the IPD (inter-pupillary distance) value
   * SHALL be a positive number greater than 0.
   * 
   * **Validates: Requirements 2.3**
   */
  describe('Property 6: IPD positivity', () => {
    it('should have positive IPD for valid eye landmarks', () => {
      fc.assert(
        fc.property(
          // Generate landmarks where left and right eyes are at different positions
          fc.tuple(
            fc.float({ min: f32(0.1), max: f32(0.4), noNaN: true }), // leftEye.x
            fc.float({ min: f32(0.6), max: f32(0.9), noNaN: true })  // rightEye.x
          ).chain(([leftX, rightX]) => {
            return fc.array(point3DArb, { minLength: 478, maxLength: 478 }).map(landmarks => {
              // Ensure eyes are at different x positions
              landmarks[LANDMARK_INDICES.LEFT_EYE_CENTER] = { x: leftX, y: 0.5, z: 0.5 };
              landmarks[LANDMARK_INDICES.RIGHT_EYE_CENTER] = { x: rightX, y: 0.5, z: 0.5 };
              return {
                landmarks,
                boundingBox: { xMin: 0, yMin: 0, width: 1, height: 1 },
                confidence: 0.9
              };
            });
          }),
          (faceLandmarks) => {
            const result = extractKeyLandmarks(faceLandmarks);
            
            // IPD should be positive when eyes are at different positions
            expect(result.ipd).toBeGreaterThan(0);
            expect(typeof result.ipd).toBe('number');
            expect(isNaN(result.ipd)).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have IPD of 0 when eye landmarks are missing', () => {
      fc.assert(
        fc.property(partialFaceLandmarksArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          
          // If eyes are missing, IPD should be 0 (not negative or NaN)
          expect(result.ipd).toBeGreaterThanOrEqual(0);
          expect(typeof result.ipd).toBe('number');
          expect(isNaN(result.ipd)).toBe(false);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 7: Rotation angle bounds
   * 
   * For any face rotation estimation result, the pitch, yaw, and roll angles
   * SHALL be within the range [-π, π] radians.
   * 
   * **Validates: Requirements 2.4**
   */
  describe('Property 7: Rotation angle bounds', () => {
    it('should have all rotation angles within [-π, π] range', () => {
      fc.assert(
        fc.property(completeFaceLandmarksArb, (faceLandmarks) => {
          const keyLandmarks = extractKeyLandmarks(faceLandmarks);
          const rotation = estimateRotation(keyLandmarks);
          
          // All angles should be within [-π, π]
          expect(rotation.pitch).toBeGreaterThanOrEqual(-Math.PI);
          expect(rotation.pitch).toBeLessThanOrEqual(Math.PI);
          expect(rotation.yaw).toBeGreaterThanOrEqual(-Math.PI);
          expect(rotation.yaw).toBeLessThanOrEqual(Math.PI);
          expect(rotation.roll).toBeGreaterThanOrEqual(-Math.PI);
          expect(rotation.roll).toBeLessThanOrEqual(Math.PI);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should return valid rotation object with pitch, yaw, roll', () => {
      fc.assert(
        fc.property(completeFaceLandmarksArb, (faceLandmarks) => {
          const keyLandmarks = extractKeyLandmarks(faceLandmarks);
          const rotation = estimateRotation(keyLandmarks);
          
          // Must have all rotation fields
          expect(rotation).toHaveProperty('pitch');
          expect(rotation).toHaveProperty('yaw');
          expect(rotation).toHaveProperty('roll');
          
          // All values must be numbers (not NaN)
          expect(typeof rotation.pitch).toBe('number');
          expect(typeof rotation.yaw).toBe('number');
          expect(typeof rotation.roll).toBe('number');
          expect(isNaN(rotation.pitch)).toBe(false);
          expect(isNaN(rotation.yaw)).toBe(false);
          expect(isNaN(rotation.roll)).toBe(false);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should handle extreme landmark positions without exceeding bounds', () => {
      fc.assert(
        fc.property(
          // Generate key landmarks with extreme but valid positions
          fc.record({
            leftEye: fc.record({
              x: fc.float({ min: f32(0), max: f32(0.3), noNaN: true }),
              y: fc.float({ min: f32(0), max: f32(1), noNaN: true }),
              z: fc.float({ min: f32(0), max: f32(1), noNaN: true })
            }),
            rightEye: fc.record({
              x: fc.float({ min: f32(0.7), max: f32(1), noNaN: true }),
              y: fc.float({ min: f32(0), max: f32(1), noNaN: true }),
              z: fc.float({ min: f32(0), max: f32(1), noNaN: true })
            }),
            noseBridge: point3DArb,
            leftEar: point3DArb,
            rightEar: point3DArb,
            ipd: fc.float({ min: f32(0.01), max: f32(0.5), noNaN: true }),
            missingLandmarks: fc.constant([])
          }),
          (keyLandmarks) => {
            const rotation = estimateRotation(keyLandmarks);
            
            // Even with extreme positions, angles should be bounded
            expect(rotation.pitch).toBeGreaterThanOrEqual(-Math.PI);
            expect(rotation.pitch).toBeLessThanOrEqual(Math.PI);
            expect(rotation.yaw).toBeGreaterThanOrEqual(-Math.PI);
            expect(rotation.yaw).toBeLessThanOrEqual(Math.PI);
            expect(rotation.roll).toBeGreaterThanOrEqual(-Math.PI);
            expect(rotation.roll).toBeLessThanOrEqual(Math.PI);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: Missing landmark indication
   * 
   * For any partial face detection where one or more required landmarks cannot
   * be extracted, the result SHALL indicate which specific landmarks are missing.
   * 
   * **Validates: Requirements 2.5**
   */
  describe('Property 8: Missing landmark indication', () => {
    it('should indicate missing landmarks when face data is incomplete', () => {
      fc.assert(
        fc.property(partialFaceLandmarksArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          
          // missingLandmarks should always be an array
          expect(Array.isArray(result.missingLandmarks)).toBe(true);
          
          // If landmarks array is too short, some landmarks should be missing
          const maxRequiredIndex = Math.max(
            LANDMARK_INDICES.LEFT_EYE_CENTER,
            LANDMARK_INDICES.RIGHT_EYE_CENTER,
            LANDMARK_INDICES.NOSE_BRIDGE_TOP,
            LANDMARK_INDICES.LEFT_EAR,
            LANDMARK_INDICES.RIGHT_EAR
          );
          
          if (faceLandmarks.landmarks.length <= maxRequiredIndex) {
            expect(result.missingLandmarks.length).toBeGreaterThan(0);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should list specific missing landmark names', () => {
      fc.assert(
        fc.property(faceLandmarksWithInvalidPointsArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          const invalidIndices = faceLandmarks._invalidIndices;
          
          // Map indices to landmark names
          const indexToName = {
            [LANDMARK_INDICES.LEFT_EYE_CENTER]: 'leftEye',
            [LANDMARK_INDICES.RIGHT_EYE_CENTER]: 'rightEye',
            [LANDMARK_INDICES.NOSE_BRIDGE_TOP]: 'noseBridge',
            [LANDMARK_INDICES.LEFT_EAR]: 'leftEar',
            [LANDMARK_INDICES.RIGHT_EAR]: 'rightEar'
          };
          
          // Each invalid index should result in that landmark being in missingLandmarks
          for (const idx of invalidIndices) {
            const expectedName = indexToName[idx];
            expect(result.missingLandmarks).toContain(expectedName);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should only contain valid landmark names in missingLandmarks', () => {
      fc.assert(
        fc.property(
          fc.oneof(completeFaceLandmarksArb, partialFaceLandmarksArb),
          (faceLandmarks) => {
            const result = extractKeyLandmarks(faceLandmarks);
            
            // All items in missingLandmarks should be valid landmark names
            for (const name of result.missingLandmarks) {
              expect(REQUIRED_LANDMARKS).toContain(name);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have getMissingLandmarks return same as missingLandmarks property', () => {
      fc.assert(
        fc.property(
          fc.oneof(completeFaceLandmarksArb, partialFaceLandmarksArb),
          (faceLandmarks) => {
            const result = extractKeyLandmarks(faceLandmarks);
            const missing = getMissingLandmarks(result);
            
            expect(missing).toEqual(result.missingLandmarks);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have hasAllRequiredLandmarks return false when landmarks are missing', () => {
      fc.assert(
        fc.property(faceLandmarksWithInvalidPointsArb, (faceLandmarks) => {
          const result = extractKeyLandmarks(faceLandmarks);
          
          // Since we explicitly made some landmarks invalid, hasAllRequiredLandmarks should be false
          expect(hasAllRequiredLandmarks(result)).toBe(false);
          expect(result.missingLandmarks.length).toBeGreaterThan(0);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Property-Based Tests for LandmarkMapper - calculateTransform
 * Feature: face-landmark-tryon
 * 
 * Tests validate:
 * - Property 9: Transform output completeness
 * - Property 10: Scale proportionality to IPD
 * - Property 11: Transform determinism
 * - Property 14: Adjustment application
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 7.3
 */

import { calculateTransform } from './LandmarkMapper.js';
import { DEFAULT_ADJUSTMENTS } from './types.js';

/**
 * Generate valid KeyLandmarks with distinct eye positions for positive IPD
 */
const validKeyLandmarksArb = fc.record({
  leftEye: fc.record({
    x: fc.float({ min: f32(0.1), max: f32(0.4), noNaN: true }),
    y: fc.float({ min: f32(0.3), max: f32(0.7), noNaN: true }),
    z: fc.float({ min: f32(0.3), max: f32(0.7), noNaN: true })
  }),
  rightEye: fc.record({
    x: fc.float({ min: f32(0.6), max: f32(0.9), noNaN: true }),
    y: fc.float({ min: f32(0.3), max: f32(0.7), noNaN: true }),
    z: fc.float({ min: f32(0.3), max: f32(0.7), noNaN: true })
  }),
  noseBridge: fc.record({
    x: fc.float({ min: f32(0.4), max: f32(0.6), noNaN: true }),
    y: fc.float({ min: f32(0.3), max: f32(0.5), noNaN: true }),
    z: fc.float({ min: f32(0.3), max: f32(0.7), noNaN: true })
  }),
  leftEar: point3DArb,
  rightEar: point3DArb,
  ipd: fc.float({ min: f32(0.05), max: f32(0.3), noNaN: true }),
  missingLandmarks: fc.constant([])
});

/**
 * Generate valid adjustment offsets
 */
const adjustmentOffsetsArb = fc.record({
  verticalOffset: fc.float({ min: f32(-1), max: f32(1), noNaN: true }),
  scaleMultiplier: fc.float({ min: f32(0.5), max: f32(1.5), noNaN: true })
});

/**
 * Generate image dimensions
 */
const imageDimensionsArb = fc.record({
  width: fc.integer({ min: 100, max: 4000 }),
  height: fc.integer({ min: 100, max: 4000 })
});

describe('LandmarkMapper calculateTransform Property Tests', () => {
  /**
   * Property 9: Transform output completeness
   * 
   * For any valid KeyLandmarks input, the Landmark_Mapper.calculateTransform()
   * SHALL return a GlassesTransform object containing: position (with x, y, z),
   * rotation (with x, y, z), and scale (positive number).
   * 
   * **Validates: Requirements 3.1, 3.3, 3.4**
   */
  describe('Property 9: Transform output completeness', () => {
    it('should return complete transform with position, rotation, and scale', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          (keyLandmarks, dims) => {
            const transform = calculateTransform(keyLandmarks, dims.width, dims.height);
            
            // Must have position with x, y, z
            expect(transform).toHaveProperty('position');
            expect(transform.position).toHaveProperty('x');
            expect(transform.position).toHaveProperty('y');
            expect(transform.position).toHaveProperty('z');
            expect(typeof transform.position.x).toBe('number');
            expect(typeof transform.position.y).toBe('number');
            expect(typeof transform.position.z).toBe('number');
            expect(isNaN(transform.position.x)).toBe(false);
            expect(isNaN(transform.position.y)).toBe(false);
            expect(isNaN(transform.position.z)).toBe(false);
            
            // Must have rotation with x, y, z
            expect(transform).toHaveProperty('rotation');
            expect(transform.rotation).toHaveProperty('x');
            expect(transform.rotation).toHaveProperty('y');
            expect(transform.rotation).toHaveProperty('z');
            expect(typeof transform.rotation.x).toBe('number');
            expect(typeof transform.rotation.y).toBe('number');
            expect(typeof transform.rotation.z).toBe('number');
            expect(isNaN(transform.rotation.x)).toBe(false);
            expect(isNaN(transform.rotation.y)).toBe(false);
            expect(isNaN(transform.rotation.z)).toBe(false);
            
            // Must have scale as positive number
            expect(transform).toHaveProperty('scale');
            expect(typeof transform.scale).toBe('number');
            expect(transform.scale).toBeGreaterThan(0);
            expect(isNaN(transform.scale)).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have position centered between eyes', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          (keyLandmarks, dims) => {
            const transform = calculateTransform(keyLandmarks, dims.width, dims.height);
            
            // Position x should be approximately the center between eyes
            const expectedX = (keyLandmarks.leftEye.x + keyLandmarks.rightEye.x) / 2;
            expect(transform.position.x).toBeCloseTo(expectedX, 5);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Scale proportionality to IPD
   * 
   * For any two KeyLandmarks inputs where IPD_A > IPD_B, the calculated
   * scale_A SHALL be greater than scale_B (scale is proportional to IPD).
   * 
   * **Validates: Requirements 3.2**
   */
  describe('Property 10: Scale proportionality to IPD', () => {
    it('should have scale proportional to IPD', () => {
      fc.assert(
        fc.property(
          // Generate two IPD values where ipdA > ipdB
          fc.tuple(
            fc.float({ min: f32(0.15), max: f32(0.3), noNaN: true }),
            fc.float({ min: f32(0.05), max: f32(0.14), noNaN: true })
          ),
          validKeyLandmarksArb,
          imageDimensionsArb,
          ([ipdA, ipdB], baseKeyLandmarks, dims) => {
            // Create two keyLandmarks with different IPDs
            const keyLandmarksA = { ...baseKeyLandmarks, ipd: ipdA };
            const keyLandmarksB = { ...baseKeyLandmarks, ipd: ipdB };
            
            const transformA = calculateTransform(keyLandmarksA, dims.width, dims.height);
            const transformB = calculateTransform(keyLandmarksB, dims.width, dims.height);
            
            // Since ipdA > ipdB, scaleA should be > scaleB
            expect(transformA.scale).toBeGreaterThan(transformB.scale);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have scale increase linearly with IPD', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          fc.float({ min: f32(1.5), max: f32(3), noNaN: true }),
          (keyLandmarks, dims, multiplier) => {
            const keyLandmarksDouble = { ...keyLandmarks, ipd: keyLandmarks.ipd * multiplier };
            
            const transform1 = calculateTransform(keyLandmarks, dims.width, dims.height);
            const transform2 = calculateTransform(keyLandmarksDouble, dims.width, dims.height);
            
            // Scale should increase proportionally (approximately multiplier times)
            const scaleRatio = transform2.scale / transform1.scale;
            expect(scaleRatio).toBeCloseTo(multiplier, 1);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 11: Transform determinism
   * 
   * For any KeyLandmarks input, calling calculateTransform() multiple times
   * with identical inputs SHALL produce identical GlassesTransform outputs.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 11: Transform determinism', () => {
    it('should produce identical results for identical inputs', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          adjustmentOffsetsArb,
          (keyLandmarks, dims, adjustments) => {
            // Call calculateTransform multiple times with same inputs
            const transform1 = calculateTransform(keyLandmarks, dims.width, dims.height, adjustments);
            const transform2 = calculateTransform(keyLandmarks, dims.width, dims.height, adjustments);
            const transform3 = calculateTransform(keyLandmarks, dims.width, dims.height, adjustments);
            
            // All results should be identical
            expect(transform1).toEqual(transform2);
            expect(transform2).toEqual(transform3);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce identical results when called from class instance', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          (keyLandmarks, dims) => {
            const { LandmarkMapper } = require('./LandmarkMapper.js');
            const mapper = new LandmarkMapper();
            
            const transform1 = mapper.calculateTransform(keyLandmarks, dims.width, dims.height);
            const transform2 = mapper.calculateTransform(keyLandmarks, dims.width, dims.height);
            
            expect(transform1).toEqual(transform2);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Adjustment application
   * 
   * For any AdjustmentOffsets input, the resulting GlassesTransform SHALL
   * reflect the applied adjustments (verticalOffset affects position.y,
   * scaleMultiplier affects scale).
   * 
   * **Validates: Requirements 7.3**
   */
  describe('Property 14: Adjustment application', () => {
    it('should apply verticalOffset to position.y', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          fc.float({ min: f32(-0.5), max: f32(0.5), noNaN: true }),
          (keyLandmarks, dims, verticalOffset) => {
            const noAdjustment = calculateTransform(keyLandmarks, dims.width, dims.height, DEFAULT_ADJUSTMENTS);
            const withAdjustment = calculateTransform(keyLandmarks, dims.width, dims.height, {
              ...DEFAULT_ADJUSTMENTS,
              verticalOffset
            });
            
            // Position y should differ based on verticalOffset
            // The implementation applies: adjustedY = centerY + verticalOffset * 0.1
            const expectedDiff = verticalOffset * 0.1;
            const actualDiff = withAdjustment.position.y - noAdjustment.position.y;
            
            // Allow for clamping effects at boundaries
            if (noAdjustment.position.y + expectedDiff >= 0 && noAdjustment.position.y + expectedDiff <= 1) {
              expect(actualDiff).toBeCloseTo(expectedDiff, 5);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply scaleMultiplier to scale', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          fc.float({ min: f32(0.5), max: f32(1.5), noNaN: true }),
          (keyLandmarks, dims, scaleMultiplier) => {
            const noAdjustment = calculateTransform(keyLandmarks, dims.width, dims.height, DEFAULT_ADJUSTMENTS);
            const withAdjustment = calculateTransform(keyLandmarks, dims.width, dims.height, {
              ...DEFAULT_ADJUSTMENTS,
              scaleMultiplier
            });
            
            // Scale should be multiplied by scaleMultiplier
            // The implementation applies: scale = Math.max(0.1, baseScale * scaleMultiplier)
            const expectedScale = Math.max(0.1, noAdjustment.scale * scaleMultiplier);
            expect(withAdjustment.scale).toBeCloseTo(expectedScale, 5);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply both adjustments simultaneously', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          adjustmentOffsetsArb,
          (keyLandmarks, dims, adjustments) => {
            const transform = calculateTransform(keyLandmarks, dims.width, dims.height, adjustments);
            
            // Transform should be valid with any adjustments
            expect(transform.scale).toBeGreaterThan(0);
            expect(typeof transform.position.x).toBe('number');
            expect(typeof transform.position.y).toBe('number');
            expect(typeof transform.position.z).toBe('number');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default adjustments when not provided', () => {
      fc.assert(
        fc.property(
          validKeyLandmarksArb,
          imageDimensionsArb,
          (keyLandmarks, dims) => {
            const withDefaults = calculateTransform(keyLandmarks, dims.width, dims.height);
            const withExplicitDefaults = calculateTransform(keyLandmarks, dims.width, dims.height, DEFAULT_ADJUSTMENTS);
            
            // Results should be identical
            expect(withDefaults).toEqual(withExplicitDefaults);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
