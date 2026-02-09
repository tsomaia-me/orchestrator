# How to Publish Relay

Follow these steps to publish `orchestrator-relay` to NPM.

## 1. Prerequisites
Ensure you are logged in to NPM.
```bash
npm login
```

## 2. Prepare the Release
Install the correct CommonJS dependencies (downgraded for robust compatibility).
```bash
npm install
```

Build the project (compile TypeScript to `dist/`).
```bash
npm run build
```

## 3. Verify
Test the binary locally.
```bash
./bin/cli.js --help
```

## 4. Publish
Publish the package with public access.
```bash
npm publish --access public
```

---

### Troubleshooting
*   **Version Conflict**: update `version` in `package.json` before publishing.
*   **Permission Denied**: Ensure you are part of the `@tsomaia` org on NPM.
