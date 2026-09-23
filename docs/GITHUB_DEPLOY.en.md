# Deploy from GitHub

No local Node.js, Git or terminal required. Use this flow for a new image library or to update one created by this workflow.

1. **Fork the repository** into your GitHub account. Owners can use the existing repository. While this repository is private, access and forking depend on invitations and repository policy.
2. **Prepare Cloudflare:** activate R2, complete Workers onboarding and choose a `workers.dev` subdomain. Copy your 32-character Account ID.
3. **Create a custom [API token](https://dash.cloudflare.com/profile/api-tokens)** restricted to your deployment account, with account permissions: Workers Scripts **Edit**, D1 **Edit**, Workers R2 Storage **Edit**, Account Settings **Read**.
4. In your GitHub repository, open **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Add:

   | Name | Value |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
   | `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID, not a Zone ID |
   | `ADMIN_PASSWORD` | A password of 12–256 characters without line breaks |

5. Open **Actions**, enable workflows if prompted, select **部署图床 / Deploy → Run workflow**, choose **main**, leave password reset unchecked and run.
6. When all steps succeed, open the **Open image library** link in the run summary and log in with your password.

The workflow creates or reuses D1 and R2, applies migrations, generates session secrets, publishes the Worker and checks the hourly recycle-bin cleanup schedule. Cloudflare services and GitHub Actions are subject to their own quotas and billing. An available Cron slot is required. Cloud-side HEIC conversion remains subject to the documented decoding limitations.

## Updates and password resets

Back up your data, use **Sync fork → Update branch**, then manually run the deployment workflow again. Pushes and PRs do not deploy. Regular updates preserve stored images, the current password and the session secret.

To reset a password, edit `ADMIN_PASSWORD`, then run the workflow with **Reset password and sessions** checked. Existing login sessions will be invalidated.

Optionally set the repository **Variable** `IMAGE_BED_NAME` before the first deployment (default `minimal-image-bed`; 3–40 lowercase letters, digits or hyphens, starting and ending with a letter or digit). Do not change it afterward: a different name targets a different stack, not a migration. Do not manage the same stack from multiple repositories.

## Troubleshooting

- Missing settings: check the three **Secrets**, not Variables.
- 401 / 403: verify token scope, expiration and account ID.
- 10042: activate R2 and retry.
- 10072: resolve your account's Cron quota before retrying; no other Worker tasks are deleted automatically.
- Binding mismatch: deployment stops before modifying resources. Use an unused name for a new installation; verify original settings for an existing one.
- No URL: complete `workers.dev` onboarding in Workers & Pages.
- A reachable website with a failed workflow: some operations may have succeeded. Fix the failed step and rerun with the same name.

Existing local-script installations are not automatically imported: their private `wrangler.deploy.json` is not in GitHub. Keep using the original deployment method until you have explicitly matched resource names, bindings, domains and variables. Repository `wrangler.jsonc` is the source for non-secret application settings; dashboard-only edits may be overwritten. Custom domains require additional zone permissions.

Provisioning, repeat updates, secret preservation and failure cleanup have automated mock coverage. A real cloud run requires valid repository Secrets; passing these tests alone is not end-to-end cloud validation.

[Detailed Chinese guide](GITHUB_DEPLOY.md) · [Maintenance and backups](DEPLOYMENT.md)
