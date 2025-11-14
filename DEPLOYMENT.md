# Cloud deployment notes

## Hugging Face access token

The AI upscaler and optional SAM background remover use the Hugging Face Inference API via the `/api/upscale` and `/api/sam` proxies. To enable them in production you must supply a `HUGGINGFACE_TOKEN` environment variable.

1. Visit <https://huggingface.co/settings/tokens> and create a new access token with "Read" scope.
2. In your hosting provider (e.g., Vercel, Netlify), add a secret or environment variable named `HUGGINGFACE_TOKEN` whose value is the token generated in step 1.
3. Redeploy the site so the new variable is available to the serverless function.
4. Open the AI Upscaler or Background Remover tabs—if the token is working the status banner will switch to "Ready" messaging after you upload an image. If it still reports that `HUGGINGFACE_TOKEN` is required, double-check the variable name and scope.

### Choosing a SAM/background removal model

By default the `/api/sam` proxy targets [`briaai/RMBG-1.4`](https://huggingface.co/briaai/RMBG-1.4), which returns a transparent PNG cutout for the supplied image. You can override the model by setting `HUGGINGFACE_SAM_MODEL` to any compatible background-removal or Segment Anything checkpoint on Hugging Face.

For example, on Vercel add:

```
HUGGINGFACE_SAM_MODEL=briaai/RMBG-1.4
```

If you point to a pure Segment Anything model (e.g., `facebook/sam-vit-base`) ensure it accepts raw image bytes via the Inference API and returns a composited PNG or mask—otherwise the `/api/sam` handler will surface the error text returned by Hugging Face.

### Custom Hugging Face Inference base URL

Hugging Face recently migrated requests from `https://api-inference.huggingface.co` to the `https://router.huggingface.co/hf-inference` domain. The proxy functions default to the new router endpoint, but you can override it by setting `HUGGINGFACE_INFERENCE_BASE` if Hugging Face introduces future routing changes or if you host your own compatible proxy.

For example:

```
HUGGINGFACE_INFERENCE_BASE=https://router.huggingface.co/hf-inference/models
```

## Google Analytics events

Every primary interaction now emits a Google Analytics event via the existing `gtag` snippet (see `assets/js/utils.js`). Ensure GA is configured in `index.html` with your measurement ID. You can verify events in GA4's DebugView while interacting with the deployed preview.
