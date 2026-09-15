module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/evals/run-retrieval-comparison.ts'
  ],
  coverageThreshold: {
    './src/services/OpenAICompatibleClient.ts': {
      branches: 75,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/evals/retrieval-metrics.ts': {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/services/retrieval/keyword-retrieval.ts': {
      branches: 75,
      functions: 100,
      lines: 90,
      statements: 90
    },
    './src/services/retrieval/bm25-retrieval.ts': {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 90
    }
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  }
};
