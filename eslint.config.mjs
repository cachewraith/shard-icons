import js from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['node_modules/', 'main.js', 'src/generated/', 'dist/'] },
	js.configs.recommended,
	tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	},
	{
		// Build tooling and tests run in Node, not in Obsidian: its mobile-safety and
		// console rules do not apply to code that never ships in main.js.
		files: ['scripts/**/*.{ts,mjs}', 'tests/**/*.ts', '*.mjs', '*.config.ts'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/rule-custom-message': 'off',
			'obsidianmd/sample-names': 'off',
			// Tests build their fixtures in plain jsdom, without Obsidian's DOM extensions.
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/no-global-this': 'off',
		},
	},
);
