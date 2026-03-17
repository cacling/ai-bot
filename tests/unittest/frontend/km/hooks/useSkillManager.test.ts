import { describe, it, expect } from 'vitest';
import { relativeTime, isMdFile, isTextFile } from '@/km/hooks/useSkillManager';

describe('useSkillManager utility functions', () => {
  describe('relativeTime', () => {
    it('returns "刚刚" for very recent timestamps', () => {
      const now = new Date().toISOString();
      expect(relativeTime(now)).toBe('刚刚');
    });

    it('returns minutes ago for timestamps within the hour', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(relativeTime(fiveMinAgo)).toBe('5 分钟前');
    });

    it('returns hours ago for timestamps within the day', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
      expect(relativeTime(twoHoursAgo)).toBe('2 小时前');
    });

    it('returns days ago for older timestamps', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
      expect(relativeTime(threeDaysAgo)).toBe('3 天前');
    });

    it('handles exact boundaries: 59 minutes', () => {
      const fiftyNineMinAgo = new Date(Date.now() - 59 * 60_000).toISOString();
      expect(relativeTime(fiftyNineMinAgo)).toBe('59 分钟前');
    });

    it('handles exact boundaries: 60 minutes = 1 hour', () => {
      const sixtyMinAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      expect(relativeTime(sixtyMinAgo)).toBe('1 小时前');
    });

    it('handles exact boundaries: 23 hours', () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60_000).toISOString();
      expect(relativeTime(twentyThreeHoursAgo)).toBe('23 小时前');
    });

    it('handles exact boundaries: 24 hours = 1 day', () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      expect(relativeTime(twentyFourHoursAgo)).toBe('1 天前');
    });
  });

  describe('isMdFile', () => {
    it('returns true for .md files', () => {
      expect(isMdFile('README.md')).toBe(true);
      expect(isMdFile('SKILL.md')).toBe(true);
    });

    it('returns true for .MD (case insensitive)', () => {
      expect(isMdFile('test.MD')).toBe(true);
      expect(isMdFile('test.Md')).toBe(true);
    });

    it('returns false for non-md files', () => {
      expect(isMdFile('test.ts')).toBe(false);
      expect(isMdFile('test.txt')).toBe(false);
      expect(isMdFile('test.json')).toBe(false);
      expect(isMdFile('md')).toBe(false);
    });
  });

  describe('isTextFile', () => {
    it('returns true for markdown files', () => {
      expect(isTextFile('test.md')).toBe(true);
    });

    it('returns true for TypeScript files', () => {
      expect(isTextFile('test.ts')).toBe(true);
      expect(isTextFile('test.tsx')).toBe(true);
    });

    it('returns true for JavaScript files', () => {
      expect(isTextFile('test.js')).toBe(true);
      expect(isTextFile('test.jsx')).toBe(true);
    });

    it('returns true for Python files', () => {
      expect(isTextFile('test.py')).toBe(true);
    });

    it('returns true for shell scripts', () => {
      expect(isTextFile('test.sh')).toBe(true);
      expect(isTextFile('test.bash')).toBe(true);
    });

    it('returns true for config files', () => {
      expect(isTextFile('config.json')).toBe(true);
      expect(isTextFile('config.yaml')).toBe(true);
      expect(isTextFile('config.yml')).toBe(true);
      expect(isTextFile('config.toml')).toBe(true);
      expect(isTextFile('.env')).toBe(true);
    });

    it('returns true for text files', () => {
      expect(isTextFile('readme.txt')).toBe(true);
    });

    it('returns false for binary/unknown extensions', () => {
      expect(isTextFile('image.png')).toBe(false);
      expect(isTextFile('archive.zip')).toBe(false);
      expect(isTextFile('data.bin')).toBe(false);
      expect(isTextFile('doc.pdf')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isTextFile('TEST.MD')).toBe(true);
      expect(isTextFile('TEST.PY')).toBe(true);
      expect(isTextFile('CONFIG.JSON')).toBe(true);
    });
  });
});
