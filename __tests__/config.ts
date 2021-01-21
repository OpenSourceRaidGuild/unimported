import { getConfig } from '../src/config';
import { readJson } from '../src/fs';

jest.mock('../src/fs');

describe('getConfig', () => {
  it('should fallback to defaults when no options file is found', () => {
    (readJson as jest.MockedFunction<typeof readJson>).mockResolvedValueOnce(
      null,
    );
    expect(getConfig()).resolves.toMatchObject({
      ignoreUnresolved: [],
      ignoreUnimported: [],
      ignoreUnused: [],
    });
  });

  it('should allow partially defined .unimported.json file', () => {
    (readJson as jest.MockedFunction<typeof readJson>).mockResolvedValueOnce({
      ignoreUnresolved: ['some-npm-dependency'],
    });
    expect(getConfig()).resolves.toMatchObject({
      ignoreUnresolved: ['some-npm-dependency'],
      ignoreUnimported: [],
      ignoreUnused: [],
    });

    (readJson as jest.MockedFunction<typeof readJson>).mockResolvedValueOnce({
      ignoreUnimported: ['src/i18n/locales/en.ts', 'src/i18n/locales/nl.ts'],
    });
    expect(getConfig()).resolves.toMatchObject({
      ignoreUnresolved: [],
      ignoreUnimported: ['src/i18n/locales/en.ts', 'src/i18n/locales/nl.ts'],
      ignoreUnused: [],
    });

    (readJson as jest.MockedFunction<typeof readJson>).mockResolvedValueOnce({
      ignoreUnused: ['bcrypt', 'create-emotion'],
    });
    expect(getConfig()).resolves.toMatchObject({
      ignoreUnresolved: [],
      ignoreUnimported: [],
      ignoreUnused: ['bcrypt', 'create-emotion'],
    });
  });

  it('should work with full .unimported.json file', () => {
    (readJson as jest.MockedFunction<typeof readJson>).mockResolvedValueOnce({
      entry: ['src/main.ts'],
      extensions: ['.ts', '.js'],
      ignorePatterns: ['**/node_modules/**', 'private/**'],
      ignoreUnresolved: ['some-npm-dependency'],
      ignoreUnimported: ['src/i18n/locales/en.ts', 'src/i18n/locales/nl.ts'],
      ignoreUnused: ['bcrypt', 'create-emotion'],
    });
    expect(getConfig()).resolves.toMatchObject({
      ignoreUnresolved: ['some-npm-dependency'],
      ignoreUnimported: ['src/i18n/locales/en.ts', 'src/i18n/locales/nl.ts'],
      ignoreUnused: ['bcrypt', 'create-emotion'],
    });
  });
});
