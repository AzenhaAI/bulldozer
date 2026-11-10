// The weekly economy table as JSON, for AlfaCat's ticker pages and anyone
// who wants the latest headline indicators in one file.
import type { APIRoute } from 'astro';
import economy from '@data/weekly/economy.json';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(economy), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
