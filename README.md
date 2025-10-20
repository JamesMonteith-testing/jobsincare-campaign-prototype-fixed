
# JobCampaign Manager – React + Vite + Tailwind (Prototype)

A portable prototype of the JobCampaign Manager UI. Uses mocked jobs (26 rows), channel toggles, search, filters, and pagination.

## Quickstart
```bash
npm install
npm run dev
```
Then open the local URL printed by Vite.

## Notes
- Pending campaigns can toggle channels. If any channel is ON, the campaign becomes **Live**. If all are OFF (and not expired), status falls back to **Pending**. Expired rows are locked.
- Styling uses Tailwind only.
- Replace `jobsSeed` in `src/components/JobCampaignManager.tsx` with real API data and wire handlers.
