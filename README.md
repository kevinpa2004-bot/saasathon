# AssistScribe Vercel Deploy

This folder is the Vercel-ready version of AssistScribe.

## Files

- `index.html` - the full AssistScribe website UI.
- `api/report-assist.js` - the serverless API route used by AI Assist.
- `package.json` - minimal project metadata.
- `vercel.json` - Vercel settings for the API route.

## Deploy

1. Upload this `assiscribe-vercel` folder to GitHub.
2. In Vercel, choose **New Project** and import that GitHub repo.
3. In Vercel project settings, add an environment variable:
   - `OPENAI_API_KEY` = your OpenAI API key
4. Deploy.

Optional:

- Add `OPENAI_MODEL` if you want to choose a specific model.
- If you do not add `OPENAI_API_KEY`, the UI will still work, but AI Assist will show an API key error.
