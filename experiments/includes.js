import path from "path";
import assert from "assert";
import { minimatch } from "minimatch";

// Function to check if a file should be included
function shouldBeIncluded(filePath, processedPatterns) {
  let hasInclusionMatch = false;

  for (const { pattern, isNegation } of processedPatterns) {
    if (minimatch(filePath, pattern)) {
      if (isNegation) {
        // If it's an exclusion pattern, return false immediately
        return false;
      } else {
        hasInclusionMatch = true;
      }
    }
  }

  // If no exclusion pattern matched, return whether an inclusion pattern matched
  return hasInclusionMatch;
}

// Helper to transform original patterns into processed patterns
function processPatterns(patternsOriginal, currentDir) {
  return patternsOriginal.map((pattern) => {
    const isNegation = pattern.startsWith("!");
    const normalizedPattern = isNegation ? pattern.slice(1) : pattern;

    // Replace "./" with the current directory
    const finalPattern = normalizedPattern.startsWith("./")
      ? normalizedPattern.replace("./", path.join(currentDir, "/"))
      : normalizedPattern;

    return {
      pattern: finalPattern,
      isNegation,
    };
  });
}

// Test cases
const currentDir = "src"; // Simulated current directory
const files = [
  "src/index.js",
  "src/test/ex.txt",
  "src/test/deep/nested/file.txt",
  "src/docs/readme.md",
  "src/docs/guide.md",
  "assets/images/logo.png",
  "assets/metadata.txt",
];

const patternsOriginal = [
  "src/**", // Include everything in src
  "!src/test/**", // Exclude everything in src/test
  "src/test/ex.txt", // Explicitly include this file
  "!src/docs/readme.md", // Exclude a specific file
  "assets/images/**", // Include everything in assets/images (but not assets/* itself)
];

const processedPatterns = processPatterns(patternsOriginal);

// Expected results
const expectedResults = [
  true, // src/index.js -> Included by src/**
  false, // src/test/ex.txt -> Excluded by !src/test/**
  false, // src/test/deep/nested/file.txt -> Excluded by !src/test/**
  false, // src/docs/readme.md -> Excluded by !src/docs/readme.md
  true, // src/docs/guide.md -> Included by src/**
  true, // assets/images/logo.png -> Included by assets/images/**
  false, // assets/metadata.txt -> Not included by any pattern
];

// Automated tests
files.forEach((file, index) => {
  const result = shouldBeIncluded(file, processedPatterns);
  console.log(`Testing ${file}: Expected ${expectedResults[index]}, Got ${result}`);
  assert.strictEqual(result, expectedResults[index]);
});

console.log("All tests passed!");