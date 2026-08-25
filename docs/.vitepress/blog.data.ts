/**
 * The post index, built at build time from docs/blog/*.md.
 *
 * VitePress's `createContentLoader` reads the frontmatter of every matching file
 * and hands the result to any component that imports `data` from here. Generated
 * rather than hand-listed for the same reason llms.txt is: a curated array is
 * true the day it is written and quietly wrong three commits later, and nothing
 * would ever fail to tell you.
 *
 * A file starting with `_` is a draft and is excluded — the same convention the
 * rest of the site uses.
 */
import { createContentLoader, type ContentData } from 'vitepress';

export interface Post {
  url: string;
  title: string;
  description: string;
  /** ISO yyyy-mm-dd. Sorts the index, newest first. */
  date: string;
  /** Rendered as "24 August 2026" beside the post title. */
  dateLabel: string;
  tags: string[];
  /** Minutes, from the body's word count. Honest, not padded. */
  readingMinutes: number;
}

declare const data: Post[];
export { data };

/** 200 wpm is the usual figure for technical prose, rounded up, floor of 1. */
function readingMinutes(body: string): number {
  const words = body
    .replace(/```[\s\S]*?```/g, ' ')  // fenced code is scanned, not read
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default createContentLoader('blog/*.md', {
  includeSrc: true,
  transform(raw): Post[] {
    return raw
      // The index page itself matches the glob and is not a post.
      .filter((p: ContentData) => !/\/blog\/?$/.test(p.url))
      .filter((p: ContentData) => !/\/_/.test(p.url))
      .map(({ url, frontmatter, src }: ContentData) => ({
        url,
        title: frontmatter.title ?? url,
        description: frontmatter.description ?? '',
        date: frontmatter.date ?? '',
        dateLabel: new Date(frontmatter.date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        tags: frontmatter.tags ?? [],
        readingMinutes: readingMinutes(src ?? ''),
      }))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  },
});
