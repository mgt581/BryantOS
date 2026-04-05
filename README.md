# BryantOS

## Firebase Storage CORS Setup

Photos uploaded to Firebase Storage are served from `bryantos.appspot.com`.  
Browsers send a CORS preflight request before each upload/download; without a CORS policy on the bucket those preflight requests return **404** and the upload fails.

Run the following **once** (requires the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and `gsutil` authenticated to the `bryantos` project):

```bash
gsutil cors set cors.json gs://bryantos.appspot.com
```

`cors.json` (already in this repo) allows `GET`, `HEAD`, `PUT`, `POST`, and `DELETE` requests from `https://mgt581.github.io`.