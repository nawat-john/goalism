import { appendPosition, positionBetween } from "./position";

describe("appendPosition", () => {
  it("returns a key for the first item when the column is empty", () => {
    expect(appendPosition(null)).toBeTruthy();
  });

  it("each appended key sorts after the previous one", () => {
    let last: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 20; i++) {
      last = appendPosition(last);
      keys.push(last);
    }
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("positionBetween", () => {
  it("produces a key that sorts strictly between two existing keys", () => {
    const a = appendPosition(null);
    const b = appendPosition(a);
    const mid = positionBetween(a, b);
    expect([a, mid, b].sort()).toEqual([a, mid, b]);
    expect(mid).not.toBe(a);
    expect(mid).not.toBe(b);
  });

  it("produces a key before an existing key when before is null", () => {
    const onlyKey = appendPosition(null);
    const before = positionBetween(null, onlyKey);
    expect([before, onlyKey].sort()).toEqual([before, onlyKey]);
  });

  it("produces a key after an existing key when after is null", () => {
    const onlyKey = appendPosition(null);
    const after = positionBetween(onlyKey, null);
    expect([onlyKey, after].sort()).toEqual([onlyKey, after]);
  });

  it("can repeatedly insert between the same two neighbors without collision", () => {
    const a = appendPosition(null);
    const b = appendPosition(a);
    let lo = a;
    const hi = b;
    const inserted: string[] = [];
    for (let i = 0; i < 10; i++) {
      const mid = positionBetween(lo, hi);
      inserted.push(mid);
      lo = mid;
    }
    const all = [a, ...inserted, b];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(all);
  });
});
