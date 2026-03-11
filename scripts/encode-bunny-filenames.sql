-- URL-encode all Bunny CDN filenames to fix 400 Bad Request errors
-- This script encodes spaces and special characters in filenames

-- PostgreSQL function to URL-encode strings
CREATE OR REPLACE FUNCTION url_encode(s TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN string_agg(
    CASE 
      WHEN c ~ '[a-zA-Z0-9._~-]' THEN c
      WHEN c = ' ' THEN '%20'
      WHEN c = 'é' THEN '%C3%A9'
      WHEN c = 'è' THEN '%C3%A8'
      WHEN c = 'ê' THEN '%C3%AA'
      WHEN c = 'à' THEN '%C3%A0'
      WHEN c = 'ù' THEN '%C3%B9'
      WHEN c = 'û' THEN '%C3%BB'
      WHEN c = 'ô' THEN '%C3%B4'
      WHEN c = 'ç' THEN '%C3%A7'
      WHEN c = '_' THEN '_'
      WHEN c = '-' THEN '-'
      WHEN c = '.' THEN '.'
      ELSE '%' || upper(to_hex((ascii(c)::int))::text)
    END,
    ''
  )
  FROM regexp_split_to_table(s, '') t(c);
END
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update all existing videos with properly encoded URLs
UPDATE videos
SET storage_path = 
  CASE 
    WHEN storage_path LIKE 'https://2mstreamsn.b-cdn.net/videos/%' THEN
      regexp_replace(
        storage_path,
        'https://2mstreamsn\.b-cdn\.net/videos/(.*)$',
        'https://2mstreamsn.b-cdn.net/videos/' || url_encode(substring(storage_path from 'videos/(.*)$')),
        'g'
      )
    ELSE storage_path
  END
WHERE storage_path LIKE 'https://2mstreamsn.b-cdn.net/videos/%'
  AND storage_path NOT LIKE '%20%'
  AND storage_path NOT LIKE '%25%';
