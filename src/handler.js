const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchesKeyword(text, keyword) {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  return keywords.some(
    (k) => k && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(k)}($|[^\\p{L}\\p{N}])`, 'iu').test(text),
  );
}

export const fill = (template, vars) =>
  template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));

/**
 * Handles one `comments` webhook change. Returns a short status string (useful for logs/tests).
 * deps: {
 *   repos: { reels, activity },
 *   ig: { sendPrivateReply, sendPrivateReplyButton, replyToComment },
 *   ownIds: Set<string>,            // the business account's own IDs; its comments never get a DM
 *   storeUrl: (slug) => string,     // public link to a reel's store page
 *   oneDmPerUser?: boolean,
 * }
 */
export async function handleComment(value, { repos, ig, ownIds, storeUrl, oneDmPerUser = false }) {
  const commentId = value?.id ? String(value.id) : null;
  const mediaId = value?.media?.id ? String(value.media.id) : null;
  const userId = value?.from?.id ? String(value.from.id) : '';
  const username = value?.from?.username || '';
  const text = value?.text || '';
  const entry = { commentId, reelId: mediaId, userId, username, text };
  const skip = async (result) => {
    await repos.activity.log({ ...entry, result });
    return result;
  };

  if (!commentId || !mediaId || !userId) return skip('skip:malformed');
  if (ownIds.has(userId)) return skip('skip:own-comment');

  const reel = await repos.reels.getActiveByMediaId(mediaId);
  if (!reel) return skip('skip:unmapped-reel');
  if (!matchesKeyword(text, reel.keywords)) return skip('skip:no-keyword');
  if (oneDmPerUser && (await repos.activity.hasSentToUser(userId, mediaId))) return skip('skip:already-sent-to-user');
  // Meta can deliver the same comment more than once; only the first delivery sends a DM.
  if (!(await repos.activity.claim(entry))) return 'skip:duplicate-comment';

  const url = storeUrl(reel.slug);
  const vars = { username, url };
  const message = fill(reel.dm_message || 'Here’s everything from the reel 👇', vars);

  try {
    // Links in plain-text DMs often aren't tappable (e.g. in message requests), so the link goes in a button.
    try {
      await ig.sendPrivateReplyButton(commentId, message, url, reel.button_text || 'Shop now');
    } catch (err) {
      // Instagram allows one private reply per comment, so only fall back if the button was rejected.
      console.error(`Button DM failed for comment ${commentId}, sending plain text instead: ${err.message}`);
      await ig.sendPrivateReply(commentId, message.includes(url) ? message : `${message}\n${url}`);
    }
  } catch (err) {
    await repos.activity.finish(commentId, 'error', err.message);
    throw err;
  }
  await repos.activity.finish(commentId, 'sent');
  console.log(`DM sent to @${username} for reel ${mediaId} -> ${url}`);

  if (reel.public_reply) {
    try {
      await ig.replyToComment(commentId, fill(reel.public_reply, vars));
    } catch (err) {
      // DM already went out; a failed public reply should not cause a retry.
      console.error(`Public reply failed for comment ${commentId}: ${err.message}`);
    }
  }
  return 'sent';
}
