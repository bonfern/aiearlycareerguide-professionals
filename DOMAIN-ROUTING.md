# Same-domain integration (later, after private beta test)

The separate deployment should be tested on its own Vercel address first. At that stage it is **not** already live at `www.aiearlycareerguide.com/careerprofessionals`.

The professional UI checks its path: when on `/careerprofessionals`, it sends requests to `/careerprofessionals/api/*`; otherwise it uses `/api/*` at its standalone preview URL.

If the existing student Vercel project's cross-project rewrites support proxying to the professional deployment, **merge** entries like these into its existing `vercel.json` rather than overwriting the whole file:

```json
{
  "rewrites": [
    {"source":"/careerprofessionals", "destination":"https://YOUR-PROFESSIONAL-DEPLOYMENT.vercel.app/"},
    {"source":"/careerprofessionals/api/:path*", "destination":"https://YOUR-PROFESSIONAL-DEPLOYMENT.vercel.app/api/:path*"}
  ]
}
```

Replace the placeholder with the actual stable professional deployment address. Depending on your Vercel account/project deployment-protection and rewrite settings, cross-project rewrites might need alternative configuration or a subdomain. Verify with a browser and the Vercel request logs **before** promoting. Do not expose a private protected deployment through an unprotected proxy. Keep the student app unchanged until the private version is stable.
