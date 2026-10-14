-- Applied on every startup; every statement must be idempotent.
-- Money is stored as integer paise (₹1 = 100) to avoid rounding errors.

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime       text NOT NULL,
  data       bytea NOT NULL,
  size       integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A product page on the brand's own website. Title, image and price are a snapshot,
-- filled in from the page when the link is added and re-checked in the background.
CREATE TABLE IF NOT EXISTS links (
  id             serial PRIMARY KEY,
  url            text NOT NULL UNIQUE,
  title          text NOT NULL,
  image_url      text NOT NULL DEFAULT '',
  price_paise    integer CHECK (price_paise IS NULL OR price_paise >= 0),
  mrp_paise      integer CHECK (mrp_paise IS NULL OR mrp_paise >= 0),
  badge          text NOT NULL DEFAULT '',
  active         boolean NOT NULL DEFAULT true,
  fetch_status   text NOT NULL DEFAULT 'ok',      -- ok | broken | manual
  fetch_error    text NOT NULL DEFAULT '',
  price_changed  boolean NOT NULL DEFAULT false,
  fetched_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reels (
  ig_media_id      text PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  headline         text NOT NULL DEFAULT '',
  subtitle         text NOT NULL DEFAULT '',
  keywords         text[] NOT NULL DEFAULT '{}',
  dm_message       text NOT NULL DEFAULT '',
  button_text      text NOT NULL DEFAULT 'Shop now',
  public_reply     text NOT NULL DEFAULT '',
  active           boolean NOT NULL DEFAULT true,
  permalink        text NOT NULL DEFAULT '',
  thumbnail_url    text NOT NULL DEFAULT '',
  video_url        text NOT NULL DEFAULT '',
  caption          text NOT NULL DEFAULT '',
  media_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Each reel shows a group of 1–20 links, in the order they appear in the video.
CREATE TABLE IF NOT EXISTS reel_links (
  reel_id  text NOT NULL REFERENCES reels(ig_media_id) ON DELETE CASCADE,
  link_id  integer NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (reel_id, link_id)
);

-- One row per Instagram comment the webhook processed.
CREATE TABLE IF NOT EXISTS activity (
  id         serial PRIMARY KEY,
  comment_id text UNIQUE,
  reel_id    text,
  user_id    text NOT NULL DEFAULT '',
  username   text NOT NULL DEFAULT '',
  text       text NOT NULL DEFAULT '',
  result     text NOT NULL,
  error      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reel page opens.
CREATE TABLE IF NOT EXISTS visits (
  id         serial PRIMARY KEY,
  reel_id    text NOT NULL,
  source     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Taps that left for the brand's website. link_id is null for the "Visit website" buttons.
CREATE TABLE IF NOT EXISTS clicks (
  id         serial PRIMARY KEY,
  reel_id    text,
  link_id    integer REFERENCES links(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visits_reel_idx ON visits (reel_id);
CREATE INDEX IF NOT EXISTS activity_reel_idx ON activity (reel_id);
CREATE INDEX IF NOT EXISTS clicks_reel_idx ON clicks (reel_id);
CREATE INDEX IF NOT EXISTS clicks_link_idx ON clicks (link_id);
