/**
 * 平台选择器与页面脚本（DOM 变更时集中改这里）。
 *
 * 2026-11-03 实机体检（`pnpm check:selectors`）：
 *  - 抖音推荐流：feedCards ✓（feed-video）、commentButton ✓（feed-comment-icon）；
 *    commentInput / submitButton 需要登录后才会出现，未登录点击评论会弹手机号登录框。
 *  - 小红书探索页：feedCards ✓（section.note-item）；评论相关选择器需要登录后打开笔记详情才能验证
 *    （未登录点笔记会跳 404/登录异常页）。
 * 未登录环境下「评论相关 0 命中」是预期结果，不代表选择器失效。
 */
export interface PlatformAdapter {
  id: 'douyin' | 'xhs';
  name: string;
  home: string;
  feedCards: string;
  commentButton: string;
  commentInput: string;
  submitButton: string;
}

export const PLATFORMS: Record<'douyin' | 'xhs', PlatformAdapter> = {
  douyin: {
    id: 'douyin',
    name: '抖音',
    home: 'https://www.douyin.com/',
    feedCards: '[data-e2e="feed-video"], [data-e2e="feed-active-video"], [data-e2e="feed-item"]',
    commentButton: '[data-e2e="feed-comment-icon"], [data-e2e="comment-icon"]',
    commentInput:
      '[data-e2e="comment-input"] textarea, [contenteditable="true"][data-e2e="comment-input"], .comment-input-inner-container [contenteditable="true"], textarea[placeholder*="评论"]',
    submitButton: '[data-e2e="comment-submit"], .comment-submit',
  },
  xhs: {
    id: 'xhs',
    name: '小红书',
    home: 'https://www.xiaohongshu.com/explore',
    feedCards: 'section.note-item, .note-item',
    commentButton: '.engage-bar .comment-icon, .interact-container .comment',
    commentInput: 'textarea.comment-input, [contenteditable="true"].comment-input',
    submitButton: '.comment-submit, .submit-btn',
  },
};
