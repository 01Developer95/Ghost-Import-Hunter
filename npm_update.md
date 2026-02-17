# How to Update Your NPM Package

This guide explains how to update and publish new versions of `ghost-import-hunter` to NPM.

## 1. Commit Your Changes
First, ensure all your code changes are saved and committed to git. NPM uses the current state of your project.

```bash
git add .
git commit -m "Description of your changes"
```

## 2. Update the Version
Use the `npm version` command to update the version number in `package.json` and create a git tag. Choose the appropriate type of update:

| Command | Usage | Example |
|---------|-------|---------|
| `npm version patch` | For bug fixes or small tweaks | `1.0.2` -> `1.0.3` |
| `npm version minor` | For new features (backward compatible) | `1.0.2` -> `1.1.0` |
| `npm version major` | For breaking changes | `1.0.2` -> `2.0.0` |

**Example:**
```bash
npm version patch
```
*This command automatically updates `package.json` and creates a git commit for the version bump.*

## 3. Publish to NPM
Run the publish command. This triggers your `prepublishOnly` script (which runs `npm run build`) and uploads the new version to the NPM registry.

```bash
npm publish
```

## 4. What Happens Next?
- **Registry Update**: The NPM registry now hosts your new version.
- **Users**: Users can update to the new version using:
  ```bash
  npm update ghost-import-hunter
  # OR to force latest
  npm install ghost-import-hunter@latest
  ```
  [https://www.npmjs.com/package/ghost-import-hunter](https://www.npmjs.com/package/ghost-import-hunter)

## 5. Troubleshooting & Login
If you see an error like `EAzuthenticate` or `E401`, you are not logged in.

### How to Login
1.  Run the login command:
    ```bash
    npm login
    ```
2.  It will open your browser to authenticate.
3.  If you have 2FA enabled, it will ask for a One-Time Password (OTP) from your authenticator app.
4.  Once logged in, try `npm publish` again.

### Common Errors
- **EPUBLISHCONFLICT**: You cannot overwrite a version that already exists. Bump the version (e.g., `npm version patch`) before publishing again.
- **EOTP**: You need to provide an OTP. Run `npm publish --otp=123456`.
