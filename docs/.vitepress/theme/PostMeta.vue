<script setup>
/**
 * The byline that sits under a post's h1.
 *
 * Rendered from the page's own frontmatter rather than written into each file,
 * so the date on the page and the date the index sorts by cannot disagree —
 * which is the usual way a blog ends up with a post dated two different things
 * in two different places.
 *
 * Only renders on /blog/ pages, and never on the index.
 */
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { data as posts } from '../blog.data';

const { frontmatter, page } = useData();

const isPost = computed(
  () => page.value.relativePath.startsWith('blog/') && page.value.relativePath !== 'blog/index.md'
);

const current = computed(() => posts.find((p) => p.url.replace(/\/$/, '') === '/' + page.value.relativePath.replace(/\.md$/, '')));

const dateLabel = computed(() =>
  frontmatter.value.date
    ? new Date(frontmatter.value.date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''
);
</script>

<template>
  <div v-if="isPost" class="pmeta">
    <p class="pmeta__row">
      <time v-if="frontmatter.date" :datetime="frontmatter.date">{{ dateLabel }}</time>
      <template v-if="current">
        <span aria-hidden="true">·</span>
        <span>{{ current.readingMinutes }} min read</span>
      </template>
    </p>
    <ul v-if="frontmatter.tags?.length" class="pmeta__tags" aria-label="Tags">
      <li v-for="tag in frontmatter.tags" :key="tag">{{ tag }}</li>
    </ul>
    <p class="pmeta__back">
      <a :href="withBase('/blog/')">← All posts</a>
    </p>
  </div>
</template>
