import { test } from 'node:test';
import assert from 'node:assert/strict';
import loader from '../lib/image-loader';

const photo = 'https://abc.supabase.co/storage/v1/object/public/media/t1/products/p.jpg';

test('a bucket photo is served through the transformation endpoint at the asked width', () => {
  assert.equal(
    loader({ src: photo, width: 640, quality: 75 }),
    'https://abc.supabase.co/storage/v1/render/image/public/media/t1/products/p.jpg?width=640&quality=75',
  );
});

test('quality defaults to 75 and width is capped at what Supabase accepts', () => {
  assert.match(loader({ src: photo, width: 3840 }), /width=2500&quality=75$/);
});

test('an existing query string is kept', () => {
  assert.equal(
    loader({ src: `${photo}?v=3`, width: 320, quality: 60 }),
    'https://abc.supabase.co/storage/v1/render/image/public/media/t1/products/p.jpg?v=3&width=320&quality=60',
  );
});

test('a bucket svg or gif is served by the raw route, which labels it by its bytes', () => {
  const svg = 'https://abc.supabase.co/storage/v1/object/public/media/t1/logos/l.svg';
  const gif = 'https://abc.supabase.co/storage/v1/object/public/media/t1/logos/a.gif?x=1';
  assert.equal(loader({ src: svg, width: 100 }), `/api/media/raw?src=${encodeURIComponent(svg)}`);
  assert.equal(loader({ src: gif, width: 100, quality: 50 }), `/api/media/raw?src=${encodeURIComponent(gif)}`);
});

test('local paths and foreign hosts pass through untouched', () => {
  assert.equal(loader({ src: '/showcase/marandsea.svg', width: 100 }), '/showcase/marandsea.svg');
  assert.equal(loader({ src: 'https://cdn.example.com/a.png', width: 100 }), 'https://cdn.example.com/a.png');
});
