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

### Ignoring exports

You can skip specific exports during both `unbarrel fix` and issue detection by placing a `// unbarrel-ignore-next-line` comment on the line before the export statement:

```typescript
// unbarrel-ignore-next-line
export * from './legacy-barrel';

export * from './utils'; // this one will still be processed
```

You can also add a reason or any trailing text after the directive:

```typescript
// unbarrel-ignore-next-line -- keeping this as a barrel intentionally
export * from './public-api';
```

Block comments are supported as well:

```typescript
/* unbarrel-ignore-next-line */
export { Foo, Bar } from './barrel';
```
