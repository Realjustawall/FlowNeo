# FlowNeo v1.3.1

FlowNeo v1.3.1 is a maintenance release focused on fixing the extension packaging issue that caused Chrome to report missing icon files when loading the unpacked extension.

## Fixes

- Restored the extension icon assets referenced by `manifest.json`.
- Verified `assets/icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` are present.
- Kept the modern FlowNeo popup UI and English interface copy.
- Kept `RealJustAWall` as the developer attribution.
- Updated the extension version to `1.3.1`.
- Preserved the Google Flow helper behavior and existing permissions.

## Installation

1. Download the tested `FlowNeo-v1.3.1-FIXED.zip` package.
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the folder that directly contains `manifest.json`.
7. Pin FlowNeo if desired, then open Google Flow and use the popup controls.

## Notes

FlowNeo is an independent project and is not affiliated with Google. The helper engine uses `flow.cfcnode.com` for its remote Flow configuration specification. Review the source, permissions, and network behavior before installation.
