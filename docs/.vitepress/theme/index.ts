import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import BlogIndex from './BlogIndex.vue';
import './custom.css';

// Extends the default theme rather than replacing it: the default already ships
// accessible focus rings, a keyboard-navigable sidebar and a skip link.
// Rebuilding that to change colours would trade working a11y for a coat of paint.
// The custom Layout only fills a slot; it does not reimplement the chrome.
//
// BlogIndex is registered globally so docs/blog/index.md can use <BlogIndex />
// in markdown. PostMeta and PostNav are NOT global — they render from the page's
// own frontmatter inside Layout's doc slots, so no post has to remember to
// include them and no post can render a byline that disagrees with the index.
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('BlogIndex', BlogIndex);
  },
};
