module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/.test-space/*'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coverageReporters: ['json'],
};
