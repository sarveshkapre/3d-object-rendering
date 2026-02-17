# Self-Hosted GitHub Actions Runner Setup

This repository is configured to run CI on `runs-on: self-hosted` only.
No GitHub-hosted runner billing changes are required.

## 1) Runner host requirements

Recommended host:
- Linux x64 (Ubuntu 22.04/24.04 recommended)

Also supported:
- macOS x64/arm64 (if you register a macOS self-hosted runner)

Required tools on runner host:
- `bash`
- `git`
- `curl`
- `tar`
- Network access to `github.com` and GitHub Actions endpoints

Node.js preinstall is optional because the workflow uses `actions/setup-node@v4`.

Docker is **not required** for the current CI workflow.

## 2) Register runner in this repository

1. Open this repo on GitHub.
2. Go to: `Settings -> Actions -> Runners`.
3. Click `New self-hosted runner`.
4. Select your OS/architecture.
5. Run the generated commands on your runner machine (from GitHub UI), usually:
   - Create a folder
   - Download runner package
   - Extract package
   - Run `./config.sh --url <repo-url> --token <token>`

When prompted for labels, include at minimum:
- `self-hosted`

Optional labels you can add for clarity:
- `linux`
- `x64`
- `artifact-viewer`

## 3) Run as a persistent service

From runner directory:

Linux/macOS:
- `./svc.sh install`
- `./svc.sh start`

Or foreground mode for quick testing:
- `./run.sh`

## 4) Validate CI workload on the runner host (local smoke)

From repo root:

```bash
npm ci
npm test
npm run smoke:api
npm run build
```

These are the same core steps executed by the `ci` workflow.

## 5) Troubleshooting

- If workflow is queued forever: verify runner is `Online` in `Settings -> Actions -> Runners`.
- If checkout/setup fails: ensure runner host has outbound internet and DNS.
- If permission issues occur: run the service under a user with read/write access to the repo checkout path.
