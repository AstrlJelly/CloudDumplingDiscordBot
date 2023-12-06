/* eslint-env node */
module.exports = {
	extends: [
		// 'eslint:recommended',
		'plugin:@typescript-eslint/recommended'
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	parserOptions: {
		project: true,
	},
	root: true,
	ignorePatterns: ['commands.ts', '*.js'],
	// "@typescript-eslint/no-unused-vars": false
  };