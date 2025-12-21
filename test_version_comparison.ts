import semver from 'semver';

const testCases = [
  { latest: '1.0.0', current: '1.0.0-beta.1', expected: true }, // 1.0.0 is newer than 1.0.0-beta.1
  { latest: '1.0.0-beta.2', current: '1.0.0-beta.1', expected: true }, // beta.2 is newer than beta.1
  { latest: '1.0.0', current: '1.0.1', expected: false }, // 1.0.0 is older than 1.0.1
  { latest: '2.0.0', current: '1.9.9', expected: true },
  { latest: '1.0.0', current: '1.0.0', expected: false },
];

console.log('Running version comparison tests...');

let failed = false;

testCases.forEach(({ latest, current, expected }) => {
  const result = semver.gt(latest, current);
  if (result !== expected) {
    console.error(`FAIL: latest=${latest}, current=${current}. Expected ${expected}, got ${result}`);
    failed = true;
  } else {
    console.log(`PASS: latest=${latest}, current=${current} -> ${result}`);
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
