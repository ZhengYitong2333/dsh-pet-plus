import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EpisodeStore, scoreEpisode } from './episodes.ts';

function store(clock: () => Date = () => new Date('2026-10-29T10:00:00')) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-episodes-'));
  return { dir, e: new EpisodeStore(join(dir, 'episodes.jsonl'), clock) };
}

test('规则评分：偏好/约定高分，寒暄低分', () => {
  assert.ok(scoreEpisode('我对花生过敏，记住一下').importance >= 3);
  assert.ok(scoreEpisode('我不吃辣').importance >= 3);
  assert.equal(scoreEpisode('你好').importance, 0);
  assert.equal(scoreEpisode('在吗').importance, 0);
});

test('importance < 3 不落盘；>=3 追加并可检索', () => {
  const { dir, e } = store();
  try {
    assert.equal(e.recordTurn('你好', '你好呀', 'pet'), undefined);
    const ep = e.recordTurn('我周三下午有课，记住', '好，我记住了', 'pet');
    assert.ok(ep);
    assert.equal(e.count().active, 1);
    assert.equal(e.search('周三', 3).length, 1);
    assert.match(e.renderIndex(200), /周三下午有课/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('7 天到期：重要条目 promoted，普通条目 archived', () => {
  let now = new Date('2026-10-01T10:00:00');
  const { dir, e } = store(() => now);
  try {
    e.record({ source: 'pet', sessionId: 'a', summary: '重要约定', importance: 5 });
    e.record({ source: 'pet', sessionId: 'b', summary: '普通闲聊', importance: 3 });
    now = new Date('2026-10-10T10:00:00');
    const result = e.promoteExpired();
    assert.equal(result.promote.length, 1);
    assert.equal(result.archive.length, 1);
    assert.equal(e.count().promoted, 1);
    assert.equal(e.count().archived, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
