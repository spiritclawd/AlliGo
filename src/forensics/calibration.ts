/**
 * AlliGo - Synthetic Calibration Test
 * Runs detection on 90+ synthetic test cases and measures accuracy
 * Includes auto-tuning for threshold adjustment
 */

import { generateComprehensiveTestSuite, SyntheticTestCase, validateDetectionAccuracy } from "./synthetic-generator";
import { analyzeAgenticInternals, AgenticArchetype } from "./agentic-internals";

interface CalibrationResult {
  total_tests: number;
  correct_detections: number;
  accuracy: number;
  false_positives: number;
  false_positive_rate: number;
  recall_rate: number;
  avg_confidence: number;
  by_difficulty: {
    easy: { total: number; correct: number; accuracy: number };
    medium: { total: number; correct: number; accuracy: number };
    hard: { total: number; correct: number; accuracy: number };
  };
  by_archetype: Record<string, { 
    total: number; 
    correct: number; 
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    avg_probability: number;
    false_positives: number;
    false_negatives: number;
  }>;
  threshold_adjustments: {
    probability_cutoff: number;
    reason: string;
  } | null;
  timestamp: number;
}

// Dynamic probability cutoff (can be adjusted by auto-tuning)
let probabilityCutoff = 30;

// Import archetype-specific thresholds
import { ARCHETYPE_THRESHOLDS } from "./agentic-internals";

async function runCalibration(): Promise<CalibrationResult> {
  console.log("🔬 Running Synthetic Calibration Test...\n");
  
  const testCases = generateComprehensiveTestSuite();
  console.log(`📊 Generated ${testCases.length} test cases\n`);
  
  let correctDetections = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let truePositives = 0;
  let totalConfidence = 0;
  
  const byDifficulty = {
    easy: { total: 0, correct: 0, accuracy: 0 },
    medium: { total: 0, correct: 0, accuracy: 0 },
    hard: { total: 0, correct: 0, accuracy: 0 },
  };
  
  const byArchetype: Record<string, { 
    total: number; 
    correct: number; 
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    avg_probability: number;
    false_positives: number;
    false_negatives: number;
  }> = {};
  
  // Initialize archetype tracking
  const archetypes = Object.values(AgenticArchetype);
  for (const archetype of archetypes) {
    byArchetype[archetype] = { 
      total: 0, 
      correct: 0, 
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1_score: 0,
      avg_probability: 0,
      false_positives: 0,
      false_negatives: 0
    };
  }
  
  for (const testCase of testCases) {
    try {
      // Run analysis
      const result = await analyzeAgenticInternals(testCase.agent);
      
      // Track by difficulty
      byDifficulty[testCase.difficulty].total++;
      
      // Track by archetype
      const archetype = testCase.expected_archetype;
      if (byArchetype[archetype]) {
        byArchetype[archetype].total++;
      }
      
      // Check if detection is correct
      const topDetection = result.detected_archetypes?.[0];
      const confidence = result.confidence || 0;
      totalConfidence += confidence;
      
      // For benign cases, we expect LOW risk scores (high = good)
      const isBenign = testCase.agent.agent_handle?.includes("benign");
      
      if (isBenign) {
        // Benign cases should have high risk scores (>70 means low risk)
        if (result.risk_score >= 70) {
          correctDetections++;
          trueNegatives++;
          byDifficulty[testCase.difficulty].correct++;
        } else {
          falsePositives++;
          // Track false positive for the archetype that was wrongly detected
          const detectedArch = result.behavioral_archetypes?.[0]?.archetype;
          if (detectedArch && byArchetype[detectedArch]) {
            byArchetype[detectedArch].false_positives++;
          }
        }
      } else {
        // Malicious cases should have the expected archetype detected
        const detectedArchetypes = result.behavioral_archetypes || [];
        
        // Use archetype-specific threshold for detection
        const archetypeThreshold = ARCHETYPE_THRESHOLDS[archetype] || probabilityCutoff;
        const matchedArchetype = detectedArchetypes.find(
          (d: any) => d.archetype === archetype && d.probability >= archetypeThreshold
        );
        
        if (matchedArchetype) {
          correctDetections++;
          truePositives++;
          byDifficulty[testCase.difficulty].correct++;
          if (byArchetype[archetype]) {
            byArchetype[archetype].correct++;
            byArchetype[archetype].avg_probability += matchedArchetype.probability;
          }
        } else {
          falseNegatives++;
          if (byArchetype[archetype]) {
            byArchetype[archetype].false_negatives++;
          }
        }
      }
      
    } catch (error: any) {
      console.error(`Error on test ${testCase.id}:`, error.message);
    }
  }
  
  // Calculate accuracies
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    const d = byDifficulty[difficulty];
    d.accuracy = d.total > 0 ? d.correct / d.total : 0;
  }
  
  // Calculate per-archetype metrics
  for (const archetype of archetypes) {
    const a = byArchetype[archetype];
    if (a.total > 0) {
      a.accuracy = a.correct / a.total;
      a.recall = a.total > 0 ? a.correct / a.total : 0;
      a.precision = (a.correct + a.false_positives) > 0 
        ? a.correct / (a.correct + a.false_positives) 
        : 0;
      a.f1_score = (a.precision + a.recall) > 0 
        ? 2 * (a.precision * a.recall) / (a.precision + a.recall) 
        : 0;
    }
    if (a.correct > 0) {
      a.avg_probability = a.avg_probability / a.correct;
    }
  }
  
  // Calculate overall metrics
  const falsePositiveRate = testCases.length > 0 ? falsePositives / testCases.length : 0;
  const recallRate = (truePositives + falseNegatives) > 0 
    ? truePositives / (truePositives + falseNegatives) 
    : 0;
  
  // Auto-tuning: Adjust probability cutoff based on performance
  let thresholdAdjustments: { probability_cutoff: number; reason: string } | null = null;
  
  // If recall < 0.80 on hard cases, lower probability cutoff
  if (byDifficulty.hard.accuracy < 0.80) {
    const newCutoff = Math.max(20, probabilityCutoff - 10);
    if (newCutoff !== probabilityCutoff) {
      thresholdAdjustments = {
        probability_cutoff: newCutoff,
        reason: `Hard case accuracy ${(byDifficulty.hard.accuracy * 100).toFixed(0)}% < 80%, lowering cutoff from ${probabilityCutoff} to ${newCutoff}`
      };
      probabilityCutoff = newCutoff;
    }
  }
  
  // If FP > 10% on benign, raise cutoff
  if (falsePositiveRate > 0.10) {
    const newCutoff = Math.min(40, probabilityCutoff + 10);
    if (newCutoff !== probabilityCutoff) {
      thresholdAdjustments = {
        probability_cutoff: newCutoff,
        reason: `False positive rate ${(falsePositiveRate * 100).toFixed(0)}% > 10%, raising cutoff from ${probabilityCutoff} to ${newCutoff}`
      };
      probabilityCutoff = newCutoff;
    }
  }
  
  const result: CalibrationResult = {
    total_tests: testCases.length,
    correct_detections: correctDetections,
    accuracy: testCases.length > 0 ? correctDetections / testCases.length : 0,
    false_positives: falsePositives,
    false_positive_rate: falsePositiveRate,
    recall_rate: recallRate,
    avg_confidence: testCases.length > 0 ? totalConfidence / testCases.length : 0,
    by_difficulty: byDifficulty,
    by_archetype: byArchetype,
    threshold_adjustments: thresholdAdjustments,
    timestamp: Date.now(),
  };
  
  console.log("\n📊 CALIBRATION RESULTS\n");
  console.log("=".repeat(60));
  console.log(`Total Tests: ${result.total_tests}`);
  console.log(`Correct Detections: ${result.correct_detections}`);
  console.log(`Overall Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`False Positives: ${result.false_positives} (${(result.false_positive_rate * 100).toFixed(1)}%)`);
  console.log(`Recall Rate: ${(result.recall_rate * 100).toFixed(1)}%`);
  console.log(`Avg Confidence: ${result.avg_confidence.toFixed(2)}`);
  console.log("\nBy Difficulty:");
  for (const [diff, data] of Object.entries(byDifficulty)) {
    console.log(`  ${diff}: ${(data.accuracy * 100).toFixed(1)}% (${data.correct}/${data.total})`);
  }
  console.log("\nBy Archetype:");
  for (const [archetype, data] of Object.entries(byArchetype)) {
    if (data.total > 0) {
      console.log(`  ${archetype}:`);
      console.log(`    Accuracy: ${(data.accuracy * 100).toFixed(0)}%`);
      console.log(`    Precision: ${(data.precision * 100).toFixed(0)}%`);
      console.log(`    Recall: ${(data.recall * 100).toFixed(0)}%`);
      console.log(`    F1: ${(data.f1_score * 100).toFixed(0)}%`);
      console.log(`    Avg Prob: ${data.avg_probability.toFixed(0)}%`);
    }
  }
  if (thresholdAdjustments) {
    console.log("\n⚠️  THRESHOLD ADJUSTMENT:");
    console.log(`  ${thresholdAdjustments.reason}`);
  }
  console.log("=".repeat(60));
  
  return result;
}

// Export for use in admin endpoints
export { runCalibration, CalibrationResult, probabilityCutoff };
