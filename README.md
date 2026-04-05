# BryantOS

A personal productivity web app hosted on GitHub Pages, backed by Firebase Auth, Firestore, and Storage.

## Firebase Storage CORS setup

Firebase Storage requires an explicit CORS policy before browsers can upload or download files.
Without it, preflight (`OPTIONS`) requests return 404 and all photo uploads/loads fail.

Apply the included `cors.json` once using the Google Cloud CLI:

```bash
gsutil cors set cors.json gs://bryantos.firebasestorage.app
```

Verify the policy was applied:

```bash
gsutil cors get gs://bryantos.firebasestorage.app
```

> **Prerequisites:** install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) and
> authenticate with `gcloud auth login` (or `gcloud auth application-default login`) using an
> account that has Storage Admin permissions on the `bryantos` Firebase project.