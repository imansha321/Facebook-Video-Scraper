# Extractor

This project uses Puppeteer to collect Facebook video links related to given keywords (e.g., Sri Lanka floods) by scraping Facebook Search Videos pages. It supports multiple keywords and prints results per keyword.

## Prerequisites

- Node.js 18+ (tested on Node 24)
- Windows PowerShell (commands below use PowerShell)
- Installed dependencies in this folder:

```powershell
npm install
```


## Quick Start
Run keyword searches. You can pass keywords space-separated or as a comma-separated string.

```powershell

# Comma-separated list
node .\server.js "Sri Lanka flood, Sri Lanka floods 2025, Sri Lanka disaster"
```

Output prints per-keyword:
- Keyword
- Count of links found
- Links list

## Files
- `server.js`: Main scraper implementation and CLI.


## How It Works
- Navigates to `https://www.facebook.com/search/videos?q=<keyword>`
- Attempts to dismiss cookie dialogs and scrolls multiple times to load results
- Extracts anchors that look like video pages: URLs containing `/videos/`, `/reel/`, or `/watch/`
- Filters out generic landing pages (like `/watch/` homepage)
- Prints structured output per keyword

