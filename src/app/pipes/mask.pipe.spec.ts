import { MaskPipe } from './mask.pipe';

describe('MaskPipe', () => {
  let pipe: MaskPipe;

  beforeEach(() => {
    pipe = new MaskPipe();
  });

  it('creates an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns empty string for null value', () => {
    expect(pipe.transform(null as any, '000-000')).toBe('');
  });

  it('returns empty string for undefined value', () => {
    expect(pipe.transform(undefined as any, '000-000')).toBe('');
  });

  it('returns empty string for empty string value', () => {
    expect(pipe.transform('', '000-000')).toBe('');
  });

  it('applies pattern characters between digit placeholders', () => {
    // Pattern: 000-000 → '123' becomes '123' + '-' fills from pattern
    expect(pipe.transform('123456', '000-000')).toBe('123-456');
  });

  it('handles phone pattern with parentheses and spaces', () => {
    expect(pipe.transform('0123456789', '(000) 000-0000')).toBe('(012) 345-6789');
  });

  it('stops at end of pattern even if value is longer', () => {
    // Pattern has 4 digit slots: value is 8 digits -> truncates at 4
    expect(pipe.transform('12345678', '0000')).toBe('1234');
  });

  it('stops at end of value even if pattern is longer', () => {
    // Value is shorter than pattern
    expect(pipe.transform('12', '000-000')).toBe('12');
  });

  it('places literal characters from pattern as-is', () => {
    // Pattern '00/00/0000' for dates
    expect(pipe.transform('01012026', '00/00/0000')).toBe('01/01/2026');
  });
});
