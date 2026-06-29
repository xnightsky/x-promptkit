import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../scripts/install-dev-plugin.mjs';

test('默认：install + project scope + 无 repo', () => {
  assert.deepEqual(parseArgs([]), { mode: 'install', scope: 'project', repo: null });
});

test('--global -> user scope', () => {
  assert.deepEqual(parseArgs(['--global']), { mode: 'install', scope: 'user', repo: null });
});

test('--repo <path> -> project scope + repo', () => {
  assert.deepEqual(parseArgs(['--repo', 'some/repo']), { mode: 'install', scope: 'project', repo: 'some/repo' });
});

test('--remove 默认 project', () => {
  assert.deepEqual(parseArgs(['--remove']), { mode: 'remove', scope: 'project', repo: null });
});

test('--remove --global -> user', () => {
  assert.deepEqual(parseArgs(['--remove', '--global']), { mode: 'remove', scope: 'user', repo: null });
});

test('--global 与 --repo 互斥 -> 抛错', () => {
  assert.throws(() => parseArgs(['--global', '--repo', 'some/repo']), /互斥/);
});

test('--repo 缺参 -> 抛错', () => {
  assert.throws(() => parseArgs(['--repo']), /路径/);
});

test('--repo 空串 -> 抛错（不静默当默认）', () => {
  assert.throws(() => parseArgs(['--repo', '']), /路径/);
});

test('--remove --repo <path> -> remove + project + repo', () => {
  assert.deepEqual(parseArgs(['--remove', '--repo', 'some/repo']), { mode: 'remove', scope: 'project', repo: 'some/repo' });
});

test('未知参数 -> 抛错', () => {
  assert.throws(() => parseArgs(['--nope']), /未知参数/);
});

test('--help -> mode help', () => {
  assert.deepEqual(parseArgs(['--help']), { mode: 'help' });
});
