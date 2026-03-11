-- Update all Bunny storage URLs to Pull Zone URLs
-- This fixes the 403 error when streaming from Bunny CDN

UPDATE videos
SET storage_path = REPLACE(
  storage_path,
  'https://ny.storage.bunnycdn.com/2mstreamsn/videos/',
  'https://2mstreamsn.b-cdn.net/videos/'
)
WHERE storage_path LIKE 'https://ny.storage.bunnycdn.com/2mstreamsn/videos/%'
  AND storage_path NOT LIKE 'https://2mstreamsn.b-cdn.net/%';

-- Also handle other regions if any exist
UPDATE videos
SET storage_path = REPLACE(
  storage_path,
  'https://%.storage.bunnycdn.com/2mstreamsn/videos/',
  'https://2mstreamsn.b-cdn.net/videos/'
)
WHERE storage_path LIKE 'https://%.storage.bunnycdn.com/2mstreamsn/videos/%'
  AND storage_path NOT LIKE 'https://2mstreamsn.b-cdn.net/%';
