CREATE SEQUENCE "VideoAsset_id_seq";

SELECT setval(
  '"VideoAsset_id_seq"',
  GREATEST(COALESCE((SELECT MAX("id") FROM "VideoAsset"), 0) + 1, 1),
  false
);

ALTER SEQUENCE "VideoAsset_id_seq"
OWNED BY "VideoAsset"."id";

ALTER TABLE "VideoAsset"
ALTER COLUMN "id" SET DEFAULT nextval('"VideoAsset_id_seq"');
