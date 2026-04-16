# Contributing to unisync

Thank you for your interest in improving unisync! We aim for the highest standards of security, quality, and performance.

## Security First

This project has **zero runtime dependencies** and **zero shell usage**. Every contribution must maintain these standards:
- No new production dependencies.
- No use of `shell: true` in `child_process`.
- No `eval()`, `new Function()`, or other dangerous APIs.
- Strict TypeScript types only (no `any`).

## Development Workflow

1.  **Clone the repo**: `git clone ...`
2.  **Install dependencies**: `npm install`
3.  **Build**: `npm run build`
4.  **Test**: `npm test`

## Sync Logic

If you are adding support for a new package manager or lockfile format:
1.  Add the generator/parser in `src/lockfile/`.
2.  Update `src/sync.ts` and `src/hooks.ts` mapping.
3.  Add tests in `tests/` covering the new format.

## Coding Style

- Use Prettier for formatting.
- Ensure all tests pass before submitting a PR.
- Add documentation for any new CLI commands.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
