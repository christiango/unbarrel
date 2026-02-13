# @christiango/unbarrel

This is a package that contains some utilities that can be used to fix and enforce any problematic patterns with barrel files in your repo. In general, layers of barrel files tend to be problematic for the performance of tools like jest and webpack. For more details on the performance problems that come with barrel files check out [Speeding up the JavaScript ecosystem - The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)

## CLI

### Installation

```bash
npm install -g @christiango/unbarrel
```

### Commands

#### `unbarrel fix <barrelFile>`

Fixes problematic patterns in a barrel file. By default, all fixes are applied:

1. **Flatten `export *`** — Converts `export * from '...'` statements into explicit named exports.
2. **Fix barrel references** — Resolves re-exports that go through intermediate barrel files to point directly to the true source module.

```bash
unbarrel fix ./src/index.ts
```

**Before:**

```typescript
export * from './utils';
export { Button } from './components'; // ./components/index.ts is a barrel file
```

**After:**

```typescript
export { helper, formatDate } from './utils';
export { Button } from './components/Button'; // points to the true source
```

##### Options

| Option | Description |
| --- | --- |
| `--flatten-export-star` | Only flatten `export *` statements into explicit named exports. |
| `--fix-barrel-references` | Only resolve re-exports through barrel files to point to their true source. |

When neither option is passed, all fixes are applied. Pass one or both to selectively enable specific fixes.

```bash
# Only flatten export * statements
unbarrel fix --flatten-export-star ./src/index.ts

# Only resolve barrel file re-exports
unbarrel fix --fix-barrel-references ./src/index.ts

# Both (equivalent to no flags)
unbarrel fix --flatten-export-star --fix-barrel-references ./src/index.ts
```

This improves tree-shaking and reduces the performance overhead caused by wildcard re-exports and nested barrel files.
