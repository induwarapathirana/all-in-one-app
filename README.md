# All-in-One QR & Image Toolkit

This project ships as a static `index.html` paired with optional serverless helpers under `api/` for features that require third-party APIs.

## Deploying the serverless functions

Deploy the contents of the `api/` directory to a platform such as Vercel. Configure the following environment variables:

- `TINYPNG_API_KEY` – required by `api/tinypng.js` to authenticate with the TinyPNG API.
- `HUGGINGFACE_TOKEN` – required by `api/sam.js` to authorize calls to the Hugging Face Inference API for Segment Anything.
- `HUGGINGFACE_SAM_MODEL` *(optional)* – override the default `facebook/sam-vit-huge` checkpoint if you prefer a different SAM variant.

After setting the variables, redeploy the project so the serverless functions pick up the configuration.
