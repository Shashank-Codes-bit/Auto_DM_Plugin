import { UnfurlError, downloadImage, unfurl } from './unfurl.js';

/**
 * Reads a product page and keeps a copy of its photo, so the card can be filled in for the owner to check.
 * Returns { url, title, image_url, price, mrp } as form values (rupees), or throws UnfurlError.
 * `net` lets tests swap in a fake fetch / DNS lookup.
 */
export async function previewLink(url, { repos, net = {} }) {
  const info = await unfurl(url, net);
  let image = info.image_url;
  if (image) {
    try {
      const { buffer, mime } = await downloadImage(image, net);
      image = `/media/${await repos.media.save(buffer, mime)}`;
    } catch (err) {
      // Keep the brand's own image link; the page still works while their image server is up.
      console.warn(`Couldn’t copy the photo for ${url}: ${err.message}`);
    }
  }
  const rupees = (p) => (p == null ? '' : String(p / 100));
  return { url: info.url, title: info.title, image_url: image, price: rupees(info.price_paise), mrp: rupees(info.mrp_paise) };
}

/** Re-checks one saved link: updates its price, or marks it broken when the page is gone. */
export async function checkLink(link, { repos, net = {} }) {
  try {
    const info = await unfurl(link.url, net);
    await repos.links.markChecked(link.id, info);
    return 'ok';
  } catch (err) {
    if (err instanceof UnfurlError && [404, 410].includes(err.status)) {
      await repos.links.markBroken(link.id, err.message);
      return 'broken';
    }
    await repos.links.markCheckFailed(link.id, err.message);
    return 'failed';
  }
}

/** Background job: every hour, re-check links that weren't checked in the last `hours` hours. */
export function startLinkChecker({ repos, hours }) {
  if (!hours) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const due = await repos.links.dueForCheck(hours);
      for (const link of due) await checkLink(link, { repos });
      if (due.length) console.log(`Checked ${due.length} product link(s)`);
    } catch (err) {
      console.error(`Link check failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, 60 * 60_000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
