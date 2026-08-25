<script setup>
/**
 * The post list.
 *
 * Hairline-separated rows rather than a grid of cards, matching the `.benefits`
 * section on the landing page — six outlined boxes fight each other, and a rule
 * is enough separation to let the titles carry the page. Titles are the loudest
 * thing here because a list of posts is scanned by title and nothing else.
 *
 * Tag filtering is client-side and URL-less on purpose: with a couple of dozen
 * posts, a filter that needs a round trip and a history entry is more machinery
 * than the problem deserves. The "All" chip is the reset, so there is never a
 * state you cannot get out of.
 */
import { ref, computed } from 'vue';
import { withBase } from 'vitepress';
import { data as posts } from '../blog.data';

const active = ref('all');

// Ordered by frequency so the useful filters sit first, not alphabetically —
// a tag on one post is not as useful as a tag on nine.
const tags = computed(() => {
  const count = new Map();
  for (const p of posts) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
});

const shown = computed(() =>
  active.value === 'all' ? posts : posts.filter((p) => p.tags.includes(active.value))
);
</script>

<template>
  <div class="blog">
    <header class="blog__head">
      <p class="blog__eyebrow">Writing</p>
      <h1 class="blog__title">Notes on browser storage</h1>
      <p class="blog__lede">
        What actually happens when you put a database in a browser tab — the
        constraints the platform imposes, the failures that do not announce
        themselves, and the measurements behind the claims.
      </p>
    </header>

    <div class="blog__filters" role="group" aria-label="Filter posts by tag">
      <button
        type="button"
        class="blog__chip"
        :class="{ 'is-on': active === 'all' }"
        :aria-pressed="active === 'all'"
        @click="active = 'all'"
      >
        All <span class="blog__chipn">{{ posts.length }}</span>
      </button>
      <button
        v-for="[tag, n] in tags"
        :key="tag"
        type="button"
        class="blog__chip"
        :class="{ 'is-on': active === tag }"
        :aria-pressed="active === tag"
        @click="active = tag"
      >
        {{ tag }} <span class="blog__chipn">{{ n }}</span>
      </button>
    </div>

    <!-- aria-live so a screen reader hears the count change when a chip is
         pressed; without it the filter is silent and appears not to have worked. -->
    <p class="blog__count" aria-live="polite">
      {{ shown.length }} {{ shown.length === 1 ? 'post' : 'posts' }}
      <template v-if="active !== 'all'">tagged {{ active }}</template>
    </p>

    <ol class="blog__list">
      <li v-for="post in shown" :key="post.url" class="blog__item">
        <a class="blog__link" :href="withBase(post.url)">
          <p class="blog__meta">
            <time :datetime="post.date">{{ post.dateLabel }}</time>
            <span aria-hidden="true">·</span>
            <span>{{ post.readingMinutes }} min read</span>
          </p>
          <h2 class="blog__post-title">{{ post.title }}</h2>
          <p class="blog__desc">{{ post.description }}</p>
          <ul class="blog__tags" aria-label="Tags">
            <li v-for="tag in post.tags" :key="tag">{{ tag }}</li>
          </ul>
        </a>
      </li>
    </ol>

    <!-- Empty-because-filtered, not empty-because-new. Those are different
         states and showing the same blank slate for both is a real bug. -->
    <p v-if="!shown.length" class="blog__empty">
      No posts tagged <strong>{{ active }}</strong> yet.
      <button type="button" class="blog__reset" @click="active = 'all'">Show all posts</button>
    </p>
  </div>
</template>
