# @christiango/unbarrel

This is a package that contains some utilities that can be used to fix and enforce any problematic patterns with barrel files in your repo. In general, layers of barrel files tend to be problematic for the performance of tools like jest and webpack. For more details on the performance problems that come with barrel files check out [Speeding up the JavaScript ecosystem - The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)

## CLI

### Installation

```bash
npm install -g @christiango/unbarrel
```

### Commands

#### `unbarrel fix <barrelFile>`

Converts all `export * from '...'` statements in a barrel file to explicit named exports.

```bash
unbarrel fix ./src/index.ts
```

**Before:**

```typescript
export * from './utils';
export * from './components';
```

**After:**

```typescript
export { helper, formatDate } from './utils';
export { Button, Input } from './components';
```

This improves tree-shaking and reduces the performance overhead caused by wildcard re-exports.
