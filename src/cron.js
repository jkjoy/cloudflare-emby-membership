// src/cron.js — 定时任务：检查过期会员
import { getExpiredMemberships, setConfig, getConfig } from './db.js';
import { setEmbyUserPolicy } from './emby.js';

export async function handleCron(env) {
  const baseUrl = (await getConfig(env.DB, 'emby_base_url'))?.value;
  const apiKey = (await getConfig(env.DB, 'emby_api_key'))?.value;

  if (!baseUrl || !apiKey) {
    console.log('Cron: Emby not configured, skipping expiry check');
    return;
  }

  const expired = await getExpiredMemberships(env.DB);
  const list = expired.results || [];
  let disabled = 0;

  for (const member of list) {
    try {
      const ok = await setEmbyUserPolicy(baseUrl, apiKey, member.emby_user_id, { isDisabled: true });
      if (ok) disabled++;
      else console.warn(`Cron: API returned false for user ${member.emby_user_id}`);
    } catch (e) {
      console.error(`Cron: failed to disable user ${member.emby_user_id}: ${e.message}`);
    }
  }

  await setConfig(env.DB, 'cron_last_run', new Date().toISOString());
  console.log(`Cron: disabled ${disabled}/${list.length} expired users`);
}