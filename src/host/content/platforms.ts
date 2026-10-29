/** 平台选择器与页面脚本（DOM 变更时集中改这里）。 */
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
    feedCards: '[data-e2e="feed-video"], [data-e2e="feed-item"]',
    commentButton: '[data-e2e="comment-icon"], [data-e2e="feed-comment-icon"]',
    commentInput: '[data-e2e="comment-input"] textarea, [contenteditable="true"][data-e2e="comment-input"]',
    submitButton: '[data-e2e="comment-submit"]',
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
