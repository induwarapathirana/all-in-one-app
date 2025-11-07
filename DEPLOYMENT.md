# Cloud deployment notes

## Hugging Face access token

The AI upscaler uses the Hugging Face Inference API via the `/api/upscale` proxy. To enable it in production you must supply a `HUGGINGFACE_TOKEN` environment variable.

1. Visit <https://huggingface.co/settings/tokens> and create a new access token with "Read" scope.
2. In your hosting provider (e.g., Vercel, Netlify), add a secret or environment variable named `HUGGINGFACE_TOKEN` whose value is the token generated in step 1.
3. Redeploy the site so the new variable is available to the serverless function.
4. Open the AI Upscaler tab—if the token is working the status banner will switch to "Ready to upscale with Real-ESRGAN" after you upload an image. If it still reports that `HUGGINGFACE_TOKEN` is required, double-check the variable name and scope.

## Google Analytics events

Every primary interaction now emits a Google Analytics event via the existing `gtag` snippet (see `assets/js/utils.js`). Ensure GA is configured in `index.html` with your measurement ID. You can verify events in GA4's DebugView while interacting with the deployed preview.
