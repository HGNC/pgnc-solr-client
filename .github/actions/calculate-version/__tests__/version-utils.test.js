'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseVersion,
  normalizeReleaseType,
  incrementVersion,
  resolveNextVersion
} = require('../lib/version-utils.js');

describe('parseVersion', () => {
  test('normalizes v-prefix', () => {
    const result = parseVersion('1.2.3');
    assert.equal(result.normalized, 'v1.2.3');
    assert.equal(result.major, 1);
    assert.equal(result.minor, 2);
    assert.equal(result.patch, 3);
  });

  test('rejects invalid input', () => {
    assert.throws(() => parseVersion('v1.2'), /Invalid semantic version/);
  });
});

describe('normalizeReleaseType', () => {
  test('defaults to patch', () => {
    assert.equal(normalizeReleaseType(undefined), 'patch');
    assert.equal(normalizeReleaseType(''), 'patch');
  });

  test('rejects unsupported values', () => {
    assert.throws(() => normalizeReleaseType('beta'), /Unsupported release_type/);
  });
});

describe('incrementVersion', () => {
  const base = parseVersion('v1.2.3');

  test('increments patch by default', () => {
    assert.equal(incrementVersion(base, 'patch'), 'v1.2.4');
  });

  test('increments minor and resets patch', () => {
    assert.equal(incrementVersion(base, 'minor'), 'v1.3.0');
  });

  test('increments major and resets others', () => {
    assert.equal(incrementVersion(base, 'major'), 'v2.0.0');
  });
});

describe('resolveNextVersion', () => {
  test('bootstraps to v1.0.0 when no tags exist', () => {
    const result = resolveNextVersion({ currentTag: '', releaseType: 'patch' });
    assert.equal(result.nextVersion, 'v1.0.0');
    assert.equal(result.isBootstrap, true);
    assert.equal(result.releaseStrategy, 'bootstrap');
  });

  test('increments patch when no override provided', () => {
    const result = resolveNextVersion({ currentTag: 'v1.0.0', releaseType: 'patch' });
    assert.equal(result.nextVersion, 'v1.0.1');
    assert.equal(result.isBootstrap, false);
    assert.equal(result.releaseStrategy, 'auto');
  });

  test('honors release_type overrides', () => {
    const major = resolveNextVersion({ currentTag: 'v1.2.3', releaseType: 'major' });
    assert.equal(major.nextVersion, 'v2.0.0');

    const minor = resolveNextVersion({ currentTag: 'v1.2.3', releaseType: 'minor' });
    assert.equal(minor.nextVersion, 'v1.3.0');
  });

  test('uses explicit version when provided and greater', () => {
    const result = resolveNextVersion({ currentTag: 'v1.2.3', explicitVersion: 'v1.4.0' });
    assert.equal(result.nextVersion, 'v1.4.0');
    assert.equal(result.releaseStrategy, 'explicit');
  });

  test('throws when explicit version is not greater', () => {
    assert.throws(() => {
      resolveNextVersion({ currentTag: 'v1.2.3', explicitVersion: 'v1.2.3' });
    }, /explicit_version/);
  });
});
