import test from 'node:test';
import assert from 'node:assert';
import { parsePageId, parsePostId, parsePageSlugFromPostLink, normalizeFbUrl, buildObjectStoryId } from '../src/parsers.js';

test('parsePageId works correctly', () => {
  // Numeric ID
  assert.deepStrictEqual(parsePageId('123456789'), { id: '123456789', slug: null, needsResolve: false, error: null });

  // Vanity/slug username
  assert.deepStrictEqual(parsePageId('my.vanity.page'), { id: null, slug: 'my.vanity.page', needsResolve: true, error: null });

  // Page name text
  assert.deepStrictEqual(parsePageId('Hải Đăng Review tạp hóa'), { id: null, slug: 'Hải Đăng Review tạp hóa', needsResolve: true, error: null });

  // Full URL profile id
  assert.deepStrictEqual(parsePageId('https://www.facebook.com/profile.php?id=987654321'), { id: '987654321', slug: null, needsResolve: false, error: null });

  // Full URL vanity
  assert.deepStrictEqual(parsePageId('https://www.facebook.com/page-slug-name'), { id: null, slug: 'page-slug-name', needsResolve: true, error: null });

  // Invalid hosts
  assert.strictEqual(parsePageId('https://google.com/page').error !== null, true);
});

test('parsePageSlugFromPostLink extracts page slug from post URLs', () => {
  assert.strictEqual(parsePageSlugFromPostLink('https://www.facebook.com/myPageName/posts/1234567890'), 'myPageName');
  assert.strictEqual(parsePageSlugFromPostLink('https://www.facebook.com/myPageName/videos/1234567890'), 'myPageName');
  assert.strictEqual(parsePageSlugFromPostLink('https://www.facebook.com/reel/1234567890'), null);
});

test('parsePostId works correctly with different formats', () => {
  // Numeric ID
  assert.deepStrictEqual(parsePostId('987654321_123456789'), {
    postId: '123456789',
    pageIdFromLink: '987654321',
    kind: 'post',
    opaque: false,
    error: null
  });

  // Simple numeric post ID
  assert.deepStrictEqual(parsePostId('123456789'), {
    postId: '123456789',
    pageIdFromLink: null,
    kind: 'post',
    opaque: false,
    error: null
  });

  // Post link posts/id
  assert.deepStrictEqual(parsePostId('https://www.facebook.com/myPageName/posts/1234567890'), {
    postId: '1234567890',
    pageIdFromLink: null,
    kind: 'post',
    opaque: false,
    error: null
  });

  // Video links
  assert.deepStrictEqual(parsePostId('https://www.facebook.com/video/1234567890/'), {
    postId: '1234567890',
    pageIdFromLink: null,
    kind: 'video',
    opaque: false,
    error: null
  });

  // Reel link
  assert.deepStrictEqual(parsePostId('https://www.facebook.com/reel/1234567890'), {
    postId: '1234567890',
    pageIdFromLink: null,
    kind: 'reel',
    opaque: false,
    error: null
  });

  // Photo fbid link
  assert.deepStrictEqual(parsePostId('https://www.facebook.com/photo.php?fbid=1234567890&id=98765'), {
    postId: '1234567890',
    pageIdFromLink: '98765',
    kind: 'photo',
    opaque: false,
    error: null
  });

  // Opaque pfbid link
  assert.strictEqual(parsePostId('https://www.facebook.com/myPage/posts/pfbid123456789').opaque, true);
});

test('normalizeFbUrl handles URLs correctly', () => {
  assert.strictEqual(
    normalizeFbUrl('https://m.facebook.com/somepage/posts/123?other=query'),
    'facebook.com/somepage/posts/123'
  );
  assert.strictEqual(
    normalizeFbUrl('http://www.facebook.com/permalink.php?story_fbid=123&id=456&extra=1'),
    'facebook.com/permalink.php?story_fbid=123&id=456'
  );
});

test('buildObjectStoryId builds correct ID format', () => {
  assert.strictEqual(buildObjectStoryId('123', '456'), '123_456');
  assert.strictEqual(buildObjectStoryId('', '456'), null);
});
