<script setup>
/**
 * What to read next, at the foot of a post.
 *
 * Related by shared tags, falling back to the newest posts when nothing overlaps
 * — a "related" block that renders empty is worse than one that is merely
 * approximate, because it reads as a broken component rather than a thin index.
 */
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { data as posts } from '../blog.data';

const { frontmatter, page } = useData();

const isPost = computed(
  () => page.value.relativePath.startsWith('blog/') && page.value.relativePath !== 'blog/index.md'
);

const here = computed(() => '/' + page.value.relativePath.replace(/\.md$/, ''));

const related = computed(() => {
  const tags = new Set(frontmatter.value.tags ?? []);
  const others = posts.filter((p) => p.url.replace(/\/$/, '') !== here.value);
  const scored = others
    .map((p) => ({ p, overlap: p.tags.filter((t) => tags.has(t)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || +new Date(b.p.date) - +new Date(a.p.date))
    .map((x) => x.p);
  return (scored.length ? scored : others).slice(0, 3);
});
</script>

<template>
  <aside v-if="isPost && related.length" class="pnav" aria-labelledby="pnav-h">
    <h2 id="pnav-h" class="pnav__h">Read next</h2>
    <ul class="pnav__list">
      <li v-for="post in related" :key="post.url">
        <a class="pnav__item" :href="withBase(post.url)">
          <span class="pnav__title">{{ post.title }}</span>
          <span class="pnav__desc">{{ post.description }}</span>
        </a>
      </li>
    </ul>
    <p class="pnav__cta">
      <a :href="withBase('/getting-started')">Get started with granthdb →</a>
    </p>
  </aside>
</template>
