/**
 * AlliGo - Synthetic Calibration Test
 * Runs detection on 64 synthetic test cases and measures accuracy
 */

import { generateComprehensiveTestSuite, SyntheticTestCase, validateDetectionAccuracy } from "./synthetic-generator";
import { analyzeAgenticInternals, AgenticArchetype } from "./agentic-internals";

interface CalibrationResult {
  total_tests: number;
  correct_detections: number;
  accuracy: number;
  false_positives: number;
  false_positive_rate: number;
  avg_confidence: number;
  by_difficulty: {
    easy: { total: number; correct: number; accuracy: number };
    medium: { total: number; correct: number; accuracy: number };
    hard: { total: number; correct: number; accuracy: number };
  };
  by_archetype: Record<string, { total: number; correct: number; avg_probability: number }>;
  timestamp: number;
}

async function runCalibration(): Promise<CalibrationResult> {
  console.log("🔬 Running Synthetic Calibration Test...\n");
  
  const testCases = generateComprehensiveTestSuite();
  console.log(`📊 Generated ${testCases.length} test cases\n`);
  
  let correctDetections = 0;
  let falsePositives = 0;
  let totalConfidence = 0;
  
  const byDifficulty = {
    easy: { total: 0, correct: 0, accuracy: 0 },
    medium: { total: 0, correct: 0, accuracy: 0 },
    hard: { total: 0, correct: 0, accuracy: 0 },
  };
  
  const byArchetype: Record<string, { total: number; correct: number; avg_probability: number }> = {};
  
  // Initialize archetype tracking
  const archetypes = Object.values(AgenticArchetype);
  for (const archetype of archetypes) {
    byArchetype[archetype] = { total: 0, correct: 0, avg_probability: 0 };
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
      const isBenign = testCase.agent.agent_handle.includes("benign");
      
      if (isBenign) {
        // Benign cases should have high risk scores (>70 means low risk)
        if (result.risk_score >= 70) {
          correctDetections++;
          byDifficulty[testCase.difficulty].correct++;
          if (byArchetype[archetype]) {
            byArchetype[archetype].correct++;
          }
        } else {
          falsePositives++;
        }
      } else {
        // Malicious cases should have the expected archetype detected
        const detectedArchetypes = result.detected_archetypes || [];
        const matchedArchetype = detectedArchetypes.find(
          (d: any) => d.archetype === archetype && d.probability >= 30
        );
        
        if (matchedArchetype) {
          correctDetections++;
          byDifficulty[testCase.difficulty].correct++;
          if (byArchetype[archetype]) {
            byArchetype[archetype].correct++;
            byArchetype[archetype].avg_probability += matchedArchetype.probability;
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
  
  // Average probabilities for archetypes
  for (const archetype of archetypes) {
    const a = byArchetype[archetype];
    if (a.correct > 0) {
      a.avg_probability = a.avg_probability / a.correct;
    }
  }
  
  const result: CalibrationResult = {
    total_tests: testCases.length,
    correct_detections: correctDetections,
    accuracy: testCases.length > 0 ? correctDetections / testCases.length : 0,
    false_positives: falsePositives,
    false_positive_rate: testCases.length > 0 ? falsePositives / testCases.length : 0,
    avg_confidence: testCases.length > 0 ? totalConfidence / testCases.length : 0,
    by_difficulty: byDifficulty,
    by_archetype: byArchetype,
    timestamp: Date.now(),
  };
  
  console.log("\n📊 CALIBRATION RESULTS\n");
  console.log("=".repeat(50));
  console.log(`Total Tests: ${result.total_tests}`);
  console.log(`Correct Detections: ${result.correct_detections}`);
  console.log(`Overall Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`False Positives: ${result.false_positives} (${(result.false_positive_rate * 100).toFixed(1)}%)`);
  console.log(`Avg Confidence: ${result.avg_confidence.toFixed(2)}`);
  console.log("\nBy Difficulty:");
  for (const [diff, data] of Object.entries(byDifficulty)) {
    console.log(`  ${diff}: ${(data.accuracy * 100).toFixed(1)}% (${data.correct}/${data.total})`);
  }
  console.log("\nBy Archetype:");
  for (const [archetype, data] of Object.entries(byArchetype)) {
    if (data.total > 0) {
      console.log(`  ${archetype}: ${(data.correct / data.total * 100).toFixed(0)}% correct, avg prob: ${data.avg_probability.toFixed(0)}%`);
    }
  }
  console.log("=".repeat(50));
  
  return result;
}

// Export for use in admin endpoints
export { runCalibration, CalibrationResult };
