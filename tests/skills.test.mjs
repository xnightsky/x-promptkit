import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs, resolveTargets } from '../scripts/skills.mjs';

test('默认：install + 无任何落点 flag', () => {
  assert.deepEqual(parseArgs([]), { mode: 'install', global: false, repo: null, dests: [] });
});

test('--global / --repo / --dest 累加解析', () => {
  assert.deepEqual(parseArgs(['--global', '--repo', 'some/repo', '--dest', 'a', '--dest', 'b']), {
    mode: 'install',
    global: true,
    repo: 'some/repo',
    dests: ['a', 'b'],
  });
});

test('--remove 默认 install 翻转', () => {
  assert.deepEqual(parseArgs(['--remove', '--dest', 'a']), { mode: 'remove', global: false, repo: null, dests: ['a'] });
});

test('--repo 缺参 -> 抛错', () => {
  assert.throws(() => parseArgs(['--repo']), /路径/);
});

test('--repo 空串 -> 抛错（不静默当默认）', () => {
  assert.throws(() => parseArgs(['--repo', '']), /路径/);
});

test('--dest 缺参 -> 抛错', () => {
  assert.throws(() => parseArgs(['--dest']), /路径/);
});

test('--dest 空串 -> 抛错', () => {
  assert.throws(() => parseArgs(['--dest', '']), /路径/);
});

test('未知参数 -> 抛错', () => {
  assert.throws(() => parseArgs(['--nope']), /未知参数/);
});

const ENV = { home: 'home-u', cwd: 'work-dir' };
const R = path.resolve;

test('resolveTargets：全空 -> 默认当前项目 .kimi-code/skills', () => {
  assert.deepEqual(resolveTargets({ mode: 'install', global: false, repo: null, dests: [] }, ENV), [
    path.join(R('work-dir'), '.kimi-code', 'skills', 'dev-run'),
  ]);
});

test('resolveTargets：--global -> home 下 .kimi-code/skills', () => {
  assert.deepEqual(resolveTargets({ mode: 'install', global: true, repo: null, dests: [] }, ENV), [
    path.join('home-u', '.kimi-code', 'skills', 'dev-run'),
  ]);
});

test('resolveTargets：多落点组合，保持声明顺序', () => {
  const ts = resolveTargets({ mode: 'install', global: true, repo: 'r', dests: ['x', 'y'] }, ENV);
  assert.deepEqual(ts, [
    path.join('home-u', '.kimi-code', 'skills', 'dev-run'),
    path.join(R('r'), '.kimi-code', 'skills', 'dev-run'),
    path.join(R('x'), 'dev-run'),
    path.join(R('y'), 'dev-run'),
  ]);
});

test('resolveTargets：重复落点去重', () => {
  const ts = resolveTargets({ mode: 'install', global: false, repo: null, dests: ['x', 'x'] }, ENV);
  assert.equal(ts.length, 1);
});
