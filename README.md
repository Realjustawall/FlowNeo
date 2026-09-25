# FlowNeo

FlowNeo is a Chrome extension that provides a compact, modern control panel for the existing helper used on **Google Flow**. It lets you enable or disable the helper, open Google Flow, reload the active Flow tab, and inspect the current helper state from the popup.

> **Independent project:** FlowNeo is not affiliated with, endorsed by, or sponsored by Google.

## Highlights

- Modern dark popup UI with the **Vazirmatn (Vazir)** typeface.
- One-click helper enable/disable control.
- Quick access to Google Flow.
- Reload action for the active Flow tab.
- Live status messages for active, armed, unavailable-spec, schema-mismatch, and reload-required states.
- Manifest V3 extension architecture.
- Branding and developer attribution set to **RealJustAWall**.

## How it works

FlowNeo registers a content script for `https://flow.google.com/*`. When the helper is enabled, the extension runs its existing Flow integration code on Google Flow pages and can patch the relevant Flow configuration response used by the helper engine.

The existing engine also requests a small remote configuration specification from:

```text
https://flow.cfcnode.com/v1/flow-spec
```

That remote specification is used by the helper engine to locate the relevant configuration fields. Because part of the engine is obfuscated and the extension depends on an external endpoint, you should review the source, permissions, and network behavior before using it.

## Permissions

FlowNeo currently requests:

```text
scripting
```

Host access is limited to:

```text
https://flow.google.com/*
https://flow.cfcnode.com/*
```

The manifest does not request direct access to browser history, cookies, saved passwords, or all websites.

## Installation

### Install from the release ZIP

1. Download `FlowNeo-v1.3.0.zip` from the latest GitHub Release.
2. Extract the ZIP to a permanent folder.
3. Open Chrome and go to:

   ```text
   chrome://extensions
   ```

4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the extracted FlowNeo folder.
7. Pin FlowNeo from the Chrome extensions menu if you want quick access.

### Update an existing unpacked installation

1. Replace the old FlowNeo files with the files from the new release.
2. Open `chrome://extensions`.
3. Find FlowNeo and click the **Reload** button.
4. Reload any open Google Flow tabs.

## Usage

1. Click the FlowNeo extension icon.
2. Turn on **Enable helper**.
3. Open Google Flow using the popup button, or switch to an existing Flow tab.
4. Reload the Flow tab after changing the helper state.
5. Check the popup status message if the helper is waiting for its spec, requires a reload, or reports a schema mismatch.

## Project structure

```text
FlowNeo/
├── manifest.json
├── app.js
├── engine.js
├── link.js
├── stat.js
├── panel.html
├── panel.css
├── panel.js
├── info.html
├── assets/
│   ├── flowneo-symbol.svg
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── README.md
└── RELEASE_NOTES.md
```

## Security notes

- `engine.js` is obfuscated, which makes independent review harder.
- The helper depends on the external `flow.cfcnode.com` specification endpoint.
- The extension is intentionally limited to the declared Flow-related hosts in the manifest.
- No security audit or guarantee is implied by this repository.
- Install unpacked extensions only when you understand and trust the code and its network dependencies.

## Typography

The UI uses **Vazirmatn**, the modern continuation of the Vazir font family. The CSS prefers a locally installed `Vazirmatn`/`Vazir` font and falls back to the Vazirmatn webfont when needed.

## Developer

**RealJustAWall**

GitHub: [Realjustawall](https://github.com/Realjustawall)

## Version

Current release: **v1.3.0**
