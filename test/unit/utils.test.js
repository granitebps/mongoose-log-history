const {
  isDate,
  isObject,
  isIsoDateString,
  exists,
  isEqual,
  areValuesEqual,
  getValueByPath,
  arrayToKeyMap,
  diffSimpleArray,
  setByPath,
  valueToString,
} = require('../../dist/utils');

describe('utils', () => {
  describe('isDate', () => {
    it('returns true for Date objects', () => {
      expect(isDate(new Date())).toBe(true);
    });
    it('returns false for non-Date values', () => {
      expect(isDate('2020-01-01')).toBe(false);
      expect(isDate({})).toBe(false);
      expect(isDate([])).toBe(false);
      expect(isDate(null)).toBe(false);
      expect(isDate(undefined)).toBe(false);
    });
  });

  describe('isObject', () => {
    it('returns true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });
    it('returns false for arrays, dates, null, and non-objects', () => {
      expect(isObject([])).toBe(false);
      expect(isObject(new Date())).toBe(false);
      expect(isObject(null)).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject('str')).toBe(false);
    });
  });

  describe('isIsoDateString', () => {
    it('returns true for valid ISO date strings', () => {
      expect(isIsoDateString('2020-01-01T00:00:00.000Z')).toBe(true);
      expect(isIsoDateString('1999-12-31T23:59:59.999Z')).toBe(true);
    });
    it('returns false for non-ISO strings', () => {
      expect(isIsoDateString('2020-01-01')).toBe(false);
      expect(isIsoDateString('not a date')).toBe(false);
      expect(isIsoDateString('')).toBe(false);
      expect(isIsoDateString(null)).toBe(false);
      expect(isIsoDateString(undefined)).toBe(false);
    });
  });

  describe('exists', () => {
    it('returns true for non-null/undefined/empty', () => {
      expect(exists(0)).toBe(true);
      expect(exists('a')).toBe(true);
      expect(exists([])).toBe(true);
      expect(exists({})).toBe(true);
      expect(exists(false)).toBe(true);
    });
    it('returns false for null/undefined/empty string', () => {
      expect(exists(null)).toBe(false);
      expect(exists(undefined)).toBe(false);
      expect(exists('')).toBe(false);
    });
  });

  describe('isEqual', () => {
    it('compares primitives', () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual('a', 'a')).toBe(true);
      expect(isEqual(1, 2)).toBe(false);
      expect(isEqual('a', 'b')).toBe(false);
    });
    it('compares arrays', () => {
      expect(isEqual([1, 2], [1, 2])).toBe(true);
      expect(isEqual([1, 2], [2, 1])).toBe(false);
      expect(isEqual([1], [1, 2])).toBe(false);
    });
    it('compares objects', () => {
      expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
      expect(isEqual({ a: { b: 2 } }, { a: { b: 2 } })).toBe(true);
    });
    it('compares dates', () => {
      expect(isEqual(new Date('2020-01-01'), new Date('2020-01-01'))).toBe(true);
      expect(isEqual(new Date('2020-01-01'), new Date('2021-01-01'))).toBe(false);
    });
    it('returns false for different types', () => {
      expect(isEqual(1, '1')).toBe(false);
      expect(isEqual({}, [])).toBe(false);
    });
  });

  describe('areValuesEqual', () => {
    it('handles null/undefined and type coercion', () => {
      expect(areValuesEqual(null, null)).toBe(true);
      expect(areValuesEqual(undefined, undefined)).toBe(true);
      expect(areValuesEqual(null, undefined)).toBe(false);
      expect(areValuesEqual(1, '1')).toBe(false);
      expect(areValuesEqual(true, 'true')).toBe(false);
    });
    it('handles arrays, objects, and dates', () => {
      expect(areValuesEqual([1], [1])).toBe(true);
      expect(areValuesEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(areValuesEqual(new Date('2020-01-01'), new Date('2020-01-01'))).toBe(true);
    });
    it('handles string/date comparison', () => {
      const d = new Date('2020-01-01T00:00:00.000Z');
      expect(areValuesEqual(d, d.toISOString())).toBe(true);
      expect(areValuesEqual(d.toISOString(), d)).toBe(true);
    });
  });

  describe('getValueByPath', () => {
    it('gets nested values', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(getValueByPath(obj, 'a.b.c')).toBe(42);
      expect(getValueByPath(obj, 'a.b')).toEqual({ c: 42 });
      expect(getValueByPath(obj, 'a.x')).toBeUndefined();
      expect(getValueByPath(obj, 'x')).toBeUndefined();
      expect(getValueByPath(obj, '')).toBeUndefined();
    });
    it('returns undefined for missing object', () => {
      expect(getValueByPath(null, 'a.b')).toBeUndefined();
      expect(getValueByPath(undefined, 'a.b')).toBeUndefined();
    });
    it('handles dot notation fields', () => {
      const obj = { 'a.b.c': 42 };
      expect(getValueByPath(obj, 'a.b.c')).toBe(42);
      expect(getValueByPath(obj, 'a.b')).toBeUndefined();
    });
  });

  describe('arrayToKeyMap', () => {
    it('maps array of objects by key', () => {
      const arr = [
        { id: 1, v: 'a' },
        { id: 2, v: 'b' },
      ];
      expect(arrayToKeyMap(arr, 'id')).toEqual({ 1: { id: 1, v: 'a' }, 2: { id: 2, v: 'b' } });
    });
    it('returns empty object for non-array', () => {
      expect(arrayToKeyMap(null, 'id')).toEqual({});
      expect(arrayToKeyMap(undefined, 'id')).toEqual({});
    });
    it('ignores items without the key', () => {
      const arr = [{ v: 'a' }, { id: 2, v: 'b' }];
      expect(arrayToKeyMap(arr, 'id')).toEqual({ 2: { id: 2, v: 'b' } });
    });
  });

  describe('diffSimpleArray', () => {
    it('returns added and removed items', () => {
      expect(diffSimpleArray([1, 2], [2, 3])).toEqual({ added: [3], removed: [1] });
      expect(diffSimpleArray([], [1])).toEqual({ added: [1], removed: [] });
      expect(diffSimpleArray([1], [])).toEqual({ added: [], removed: [1] });
      expect(diffSimpleArray([], [])).toEqual({ added: [], removed: [] });
    });
  });

  describe('setByPath', () => {
    it('sets nested value by path', () => {
      const obj = {};
      setByPath(obj, 'a.b.c', 42);
      expect(obj).toEqual({ a: { b: { c: 42 } } });
    });
    it('overwrites existing value', () => {
      const obj = { a: { b: { c: 1 } } };
      setByPath(obj, 'a.b.c', 99);
      expect(obj.a.b.c).toBe(99);
    });
    it('creates intermediate objects as needed', () => {
      const obj = {};
      setByPath(obj, 'x.y.z', 'test');
      expect(obj.x.y.z).toBe('test');
    });
  });

  describe('valueToString', () => {
    it('stringifies primitives', () => {
      expect(valueToString(1)).toBe('1');
      expect(valueToString(true)).toBe('true');
      expect(valueToString(null)).toBe(null);
      expect(valueToString(undefined)).toBe(undefined);
    });
    it('stringifies dates and ISO strings', () => {
      const d = new Date('2020-01-01T00:00:00.000Z');
      expect(valueToString(d)).toBe('2020-01-01T00:00:00.000Z');
      expect(valueToString('2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
    });
    it('stringifies objects and arrays', () => {
      expect(valueToString({ a: 1 })).toBe('{"a":1}');
      expect(valueToString([1, 2])).toBe('[1,2]');
    });
    it('handles circular references gracefully', () => {
      const obj = {};
      obj.self = obj;
      expect(typeof valueToString(obj)).toBe('string');
    });
  });
});
