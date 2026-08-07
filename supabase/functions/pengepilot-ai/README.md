# PengePilot AI Edge Function

This authenticated Supabase Edge Function provides three server-side AI actions:

- `categorize`: learned category rules first, OpenAI only for unresolved transactions.
- `explain`: answers questions from an aggregated financial snapshot.
- `savings`: generates conservative, data-grounded savings opportunities and stores them in `savings_opportunities`.

## Security

- Keep JWT verification enabled.
- The browser never receives `OPENAI_API_KEY`.
- Database reads/writes use the signed-in user's JWT and existing RLS policies; no service-role key is used.
- OpenAI Responses calls set `store: false`.
- The original bank import file is never sent to the AI function.

## Required secret

Set this in Supabase Edge Function Secrets:

`OPENAI_API_KEY=<your OpenAI API key>`

Optional model override:

`OPENAI_MODEL=gpt-5-mini`

The default model is `gpt-5-mini`.
