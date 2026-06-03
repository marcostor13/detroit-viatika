import { ShortTextPipe } from './short-text.pipe';

describe('ShortTextPipe', () => {
  let pipe: ShortTextPipe;

  beforeEach(() => {
    pipe = new ShortTextPipe();
  });

  it('creates an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns value unchanged when length <= limit', () => {
    expect(pipe.transform('hello', 10)).toBe('hello');
  });

  it('returns value unchanged when length equals limit', () => {
    expect(pipe.transform('hello', 5)).toBe('hello');
  });

  it('truncates and appends ... when value exceeds limit', () => {
    expect(pipe.transform('hello world', 5)).toBe('hello...');
  });

  it('uses default limit of 10', () => {
    expect(pipe.transform('12345678901')).toBe('1234567890...');
  });

  it('returns empty string for null input', () => {
    expect(pipe.transform(null as any, 5)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(pipe.transform(undefined as any, 5)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(pipe.transform('', 5)).toBe('');
  });
});
