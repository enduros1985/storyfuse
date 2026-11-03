import { DiscordSDK } from '@discord/embedded-app-sdk';

type ActivityAuth = { user: { id: string; username: string; global_name?: string; avatar?: string | null } };
const api = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

export function isDiscordActivity() {
  return Boolean(clientId) && window.self !== window.top;
}

export async function authenticateDiscordActivity() {
  if (!clientId || !isDiscordActivity()) return null;
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: crypto.randomUUID(),
    prompt: 'none',
    scope: ['identify', 'applications.commands'],
  });
  const response = await fetch(`${api}/api/token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error('Discord Activity authentication failed.');
  const result = await response.json() as { access_token: string; session_token: string; user: ActivityAuth['user'] };
  const auth = await sdk.commands.authenticate({ access_token: result.access_token }) as ActivityAuth;
  if (auth.user.id !== result.user.id) throw new Error('Discord returned mismatched Activity credentials.');
  return { user: auth.user, sessionToken: result.session_token };
}
