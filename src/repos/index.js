import { activityRepo } from './activity.js';
import { linksRepo } from './links.js';
import { mediaRepo } from './media.js';
import { reelsRepo } from './reels.js';
import { settingsRepo } from './settings.js';
import { statsRepo } from './stats.js';

export function createRepos(db) {
  return {
    activity: activityRepo(db),
    links: linksRepo(db),
    media: mediaRepo(db),
    reels: reelsRepo(db),
    settings: settingsRepo(db),
    stats: statsRepo(db),
  };
}
