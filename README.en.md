# PixNest

**Your images, your space.**

**A minimal, self-hosted image library on Cloudflare Workers, R2 and D1.**

[简体中文](README.md) · English

Upload, share and organize your images without a VPS, Docker or a persistent Node server. The interface supports Chinese and English on desktop and mobile. This project is in pre-release validation; see [validation notes](docs/VALIDATION.md) and the [changelog](CHANGELOG.md).

## Features

- Local files, drag and drop, clipboard and server-side URL imports, up to 20 MiB per image.
- Grid and list views, search, albums, tags, descriptions and batch management.
- Fullscreen preview with keyboard navigation and original-file downloads.
- Quick copy as a direct URL, Markdown or HTML, with your preferred format remembered.
- A 30-day recycle bin with restore and permanent deletion. Album removal preserves the image.
- Independent upload API tokens, separate from login sessions; full tokens are shown once.
- Browser HEIC / HEIF conversion to compatible previews while retaining originals.
- Password-protected administration; publicly accessible image links.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
git clone https://github.com/DingDo66/PixNest.git
cd PixNest
npm ci
npm run dev
```

Open http://localhost:8787. The first run creates a local `.dev.vars` file with the default password `local-image-bed-2026`. Edit `ADMIN_PASSWORD` and restart to change it. Local data persists in `.wrangler/state`. Rebuild with `npm run build` after frontend changes and refresh the page.

New installations start empty. With the local server running, `npm run demo:seed` adds optional sample images.

## Deploy from your browser (recommended)

Fork → configure three GitHub Secrets → run **部署图床 / Deploy** on `main` → open your site from the run summary. No terminal or local Node.js installation required.

**[Step-by-step GitHub deployment guide](docs/GITHUB_DEPLOY.en.md)**

The repository is public and can be forked into your own account. Existing local deployments are not automatically imported. Deployment runs manually; pushes only validate code.

## Deploy from a local terminal

Enable R2 in your Cloudflare account, then run:

```sh
npm run deploy
```

The interactive script logs in through Wrangler, lets you choose resources, asks for confirmation, creates or reuses D1 and R2, sets secrets, applies migrations and deploys the Worker and frontend. Generated account configuration and secrets are excluded from Git.

Use `npm run deploy -- --dry-run` to check packaging without deploying. See the [deployment guide](docs/DEPLOYMENT.md) for domains, upgrades and backups, and [media and API documentation](docs/MEDIA_API.md) for external uploads. Detailed guides are currently in Chinese.

## Boundaries

This is a single-administrator application. There is no public registration or anonymous upload. Image URLs are public to anyone who knows them; albums are private organizational views. Recycled images keep working URLs until permanent deletion. Previously downloaded or cached copies cannot be recalled.

Automatic recycle-bin cleanup requires an active Cron trigger and available account quota. Server-side HEIC conversion through Images binding currently has known decoding failures; browser-side conversion is supported. Check the validation notes before relying on HEIC uploads through URL imports or the API.

Cloudflare usage charges may apply. R2 and D1 do not share transactions; back up both files and metadata. Originals can contain EXIF metadata.

## Development

```sh
npm run typecheck
npm run build
# Keep the local Worker running in another terminal:
npm test
```

See [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).

## License

[MIT](LICENSE). The HEIC decoder dependency uses LGPL-3.0; see [third-party notices](public/licenses/NOTICE.md).
