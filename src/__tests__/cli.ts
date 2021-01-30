import fs from 'fs';
import path from 'path';
import util from 'util';
import { CliArguments } from '..';

const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir);
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);

async function exec(
  testProjectDir: string,
  { init = false, flow = false, update = false }: Partial<CliArguments> = {},
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const originalExit = process.exit;
  const originalCwd = process.cwd();
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  try {
    let exitCode: number | null = null;
    let stdout = '';
    let stderr = '';

    const appendStdout = (...args: any[]): void => {
      stdout += args.map((arg) => arg.toString()).join(' ');
    };

    const appendStderr = (...args: any[]): void => {
      stderr += args.map((arg) => arg.toString()).join(' ');
    };

    console.log = appendStdout;
    console.warn = appendStdout;
    console.error = appendStderr;

    process.exit = (code: number): never => {
      exitCode = exitCode ?? code;
      return undefined as never;
    };

    process.chdir(testProjectDir);

    const main = require('..').main as (args: CliArguments) => Promise<void>;

    await main({ init, flow, update });

    return { exitCode: exitCode ?? 0, stdout, stderr };
  } finally {
    process.chdir(originalCwd);
    process.exit = originalExit;
    Object.entries(originalConsole).forEach(([key, value]) => {
      console[key] = value;
    });
  }
}

async function createProject(
  files: Array<{ name: string; content: string }>,
  baseDir = '.',
): Promise<string> {
  const randomId = Math.floor(Math.random() * 1000000);

  const testSpaceDir = path.join('.test-space', randomId.toString());

  await mkdir(testSpaceDir, { recursive: true });

  await Promise.all(
    files.map((file) =>
      mkdir(path.join(testSpaceDir, path.dirname(file.name)), {
        recursive: true,
      }),
    ),
  );

  await Promise.all(
    files.map((file) =>
      writeFile(path.join(testSpaceDir, file.name), file.content),
    ),
  );

  return path.join(testSpaceDir, baseDir);
}

describe('cli integration tests', () => {
  const scenarios = [
    {
      description: 'should identify unimported file',
      files: [
        { name: 'package.json', content: '{ "main": "index.js" }' },
        { name: 'index.js', content: `import foo from './foo';` },
        { name: 'foo.js', content: '' },
        { name: 'bar.js', content: '' },
      ],
      exitCode: 1,
      stdout: /1 unimported files.*bar.js/s,
    },
    {
      description: 'should identify unresolved imports',
      files: [
        { name: 'package.json', content: '{ "main": "index.js" }' },
        { name: 'index.js', content: `import foo from './foo';` },
      ],
      exitCode: 1,
      stdout: /1 unresolved imports.*.\/foo/s,
    },
    {
      description: 'should identify unimported file in meteor project',
      files: [
        {
          name: 'package.json',
          content:
            '{ "meteor" : { "mainModule": { "client": "client.js", "server": "server.js" } } }',
        },
        { name: 'client.js', content: `import foo from './foo';` },
        { name: 'server.js', content: '' },
        { name: '.meteor', content: '' },
        { name: 'foo.js', content: '' },
        { name: 'bar.js', content: '' },
      ],
      exitCode: 1,
      stdout: /1 unimported files.*bar.js/s,
    },
    {
      description: 'should identify unused dependencies',
      files: [
        {
          name: 'package.json',
          content:
            '{ "main": "index.js", "dependencies": { "@test/dependency": "1.0.0" } }',
        },
        { name: 'index.js', content: `import foo from './foo';` },
        { name: 'foo.js', content: '' },
      ],
      exitCode: 1,
      stdout: /1 unused dependencies.*@test\/dependency/s,
    },
    {
      description: 'everything is used',
      files: [
        {
          name: 'package.json',
          content:
            '{ "main": "index.js", "dependencies": { "@test/dependency": "1.0.0" } }',
        },
        {
          name: 'index.js',
          content: `
import foo from './foo';
import bar from './bar';
`,
        },
        { name: 'foo.js', content: '' },
        { name: 'bar.js', content: 'import test from "@test/dependency"' },
      ],
      exitCode: 0,
      stdout: /There don't seem to be any unimported files./,
    },
    {
      description: 'all variants of import/export',
      files: [
        {
          name: 'package.json',
          content: '{ "main": "index.js" }',
        },
        {
          name: 'index.js',
          content: `import a from './a'`,
        },
        {
          name: 'a.js',
          content: `
import {b as a} from './b'
const promise = import('./d')
export {a}
export {b} from './b'
export * from './c'
export default promise
`,
        },
        { name: 'b.js', content: 'export const b = 2;' },
        { name: 'c.js', content: 'const c = 3; export {c}' },
        { name: 'd.js', content: 'export default 42' },
      ],
      exitCode: 0,
      stdout: /There don't seem to be any unimported files./,
    },
    {
      description: 'should identify ts paths imports',
      files: [
        { name: 'package.json', content: '{ "main": "index.ts" }' },
        { name: 'index.ts', content: `import foo from '@root/foo';` },
        { name: 'foo.ts', content: '' },
        { name: 'bar.ts', content: '' },
        {
          name: 'tsconfig.json',
          content: '{ "compilerOptions": { "paths": { "@root": ["."] } } }',
        },
      ],
      exitCode: 1,
      stdout: /1 unimported files.*bar.ts/s,
    },
    {
      description: 'should identify monorepo-type sibling modules',
      baseDir: 'packages/A',
      files: [
        {
          name: 'packages/A/package.json',
          content:
            '{ "main": "index.js", "repository": { "directory": "path/goes/here" } }',
        },
        {
          name: 'packages/A/index.js',
          content: `import foo from 'B/foo';`,
        },
        { name: 'packages/B/foo.js', content: '' },
        { name: 'packages/C/bar.js', content: '' },
      ],
      exitCode: 0,
      stdout: /There don't seem to be any unimported files./,
    },
    {
      description: 'supports root slash import in meteor project',
      files: [
        {
          name: 'package.json',
          content:
            '{ "meteor" : { "mainModule": { "client": "client.js", "server": "server.js" } } }',
        },
        { name: 'client.js', content: `import foo from '/foo';` },
        { name: 'server.js', content: '' },
        { name: '.meteor', content: '' },
        { name: 'foo.js', content: '' },
      ],
      exitCode: 0,
      stdout: /There don't seem to be any unimported files./s,
    },
    {
      description: 'should report parse failure for invalid file',
      files: [
        { name: 'package.json', content: '{ "main": "index.js" }' },
        { name: 'index.js', content: `not valid` },
      ],
      exitCode: 1,
      stdout: /Failed parsing.*\/index.js/s,
    },
    {
      description: 'should ignore non import/require paths',
      files: [
        { name: 'package.json', content: '{ "main": "index.js" }' },
        {
          name: 'index.js',
          content: `import fs from 'fs'; const dependency = fs.readFileSync('some_path.js');`,
        },
      ],
      exitCode: 0,
      stdout: '',
    },
  ];

  scenarios.forEach((scenario) => {
    test(scenario.description, async () => {
      const testProjectDir = await createProject(
        scenario.files,
        scenario.baseDir,
      );

      try {
        const { stdout, stderr, exitCode } = await exec(testProjectDir);

        expect(stdout).toMatch(scenario.stdout);
        expect(stderr.replace(/- initializing\s+/, '')).toMatch('');
        expect(exitCode).toBe(scenario.exitCode);
      } finally {
        await rmdir(testProjectDir, { recursive: true });
      }
    });
  });
});

// ---

describe('cli integration tests with update option', () => {
  const scenarios = [
    {
      description: 'should identify unimported file',
      files: [
        { name: 'package.json', content: '{ "main": "index.js" }' },
        { name: 'index.js', content: `import foo from './foo';` },
        { name: 'foo.js', content: '' },
        { name: 'bar.js', content: '' },
      ],
      exitCode: 0,
      output: {
        ignoreUnresolved: [],
        ignoreUnimported: ['bar.js'],
        ignoreUnused: [],
      },
    },
    {
      description: 'should identify unused dependencies',
      files: [
        {
          name: 'package.json',
          content:
            '{ "main": "index.js", "dependencies": { "@test/dependency": "1.0.0" } }',
        },
        { name: 'index.js', content: `import foo from './foo';` },
        { name: 'foo.js', content: '' },
      ],
      exitCode: 0,
      output: {
        ignoreUnresolved: [],
        ignoreUnimported: [],
        ignoreUnused: ['@test/dependency'],
      },
    },
    {
      description: 'everything is used',
      files: [
        {
          name: 'package.json',
          content:
            '{ "main": "index.js", "dependencies": { "@test/dependency": "1.0.0" } }',
        },
        {
          name: 'index.js',
          content: `
import foo from './foo';
import bar from './bar';
`,
        },
        { name: 'foo.js', content: '' },
        { name: 'bar.js', content: 'import test from "@test/dependency"' },
      ],
      exitCode: 0,
      output: {
        ignoreUnresolved: [],
        ignoreUnimported: [],
        ignoreUnused: [],
      },
    },
  ];

  scenarios.forEach((scenario) => {
    test(scenario.description, async () => {
      const testProjectDir = await createProject(scenario.files);
      const outputFile = path.join(testProjectDir, '.unimportedrc.json');

      try {
        const { exitCode } = await exec(testProjectDir, { update: true });

        const outputFileContent = JSON.parse(
          await readFile(outputFile, 'utf-8'),
        );
        expect(scenario.output).toEqual(outputFileContent);
        expect(exitCode).toBe(scenario.exitCode);
      } finally {
        await rmdir(testProjectDir, { recursive: true });
      }
    });
  });
});

describe('cli integration tests with init option', () => {
  const scenarios = [
    {
      description: 'should create default ignore file',
      files: [],
      exitCode: 0,
      output: {
        ignorePatterns: [
          '**/node_modules/**',
          '**/*.stories.{js,jsx,ts,tsx}',
          '**/*.tests.{js,jsx,ts,tsx}',
          '**/*.test.{js,jsx,ts,tsx}',
          '**/*.spec.{js,jsx,ts,tsx}',
          '**/tests/**',
          '**/__tests__/**',
          '**/*.d.ts',
        ],
        ignoreUnresolved: [],
        ignoreUnimported: [],
        ignoreUnused: [],
      },
    },
    {
      description: 'should create expected ignore file for meteor project',
      files: [
        {
          name: '.meteor',
          content: '',
        },
      ],
      exitCode: 0,
      output: {
        ignorePatterns: [
          '**/node_modules/**',
          '**/*.stories.{js,jsx,ts,tsx}',
          '**/*.tests.{js,jsx,ts,tsx}',
          '**/*.test.{js,jsx,ts,tsx}',
          '**/*.spec.{js,jsx,ts,tsx}',
          '**/tests/**',
          '**/__tests__/**',
          '**/*.d.ts',
          'packages/**',
          'public/**',
          'private/**',
          'tests/**',
        ],
        ignoreUnresolved: [],
        ignoreUnimported: [],
        ignoreUnused: [],
      },
    },
  ];

  scenarios.forEach((scenario) => {
    test(scenario.description, async () => {
      const testProjectDir = await createProject(scenario.files);
      const outputFile = path.join(testProjectDir, '.unimportedrc.json');

      try {
        const { exitCode } = await exec(testProjectDir, { init: true });

        const outputFileContent = JSON.parse(
          await readFile(outputFile, 'utf-8'),
        );
        expect(scenario.output).toEqual(outputFileContent);
        expect(exitCode).toBe(scenario.exitCode);
      } finally {
        await rmdir(testProjectDir, { recursive: true });
      }
    });
  });
});
